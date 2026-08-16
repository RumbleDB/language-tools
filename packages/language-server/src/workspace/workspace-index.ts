import { ParserService } from "server/parser/index.js";
import { createLogger } from "server/utils/logger.js";
import type { DocumentUri } from "vscode-languageserver";
import { TextDocument } from "vscode-languageserver-textdocument";
import { FileChangeType, type FileEvent } from "vscode-languageserver/node";

import { analyzeDocument } from "../analysis/builder.js";
import type { Definition } from "../analysis/definitions.js";
import { resolveImports, type ModuleProvider } from "../analysis/import-resolution.js";
import { buildModuleIndex } from "../analysis/module-index.js";
import type { ModuleIndex } from "../analysis/module-info.js";
import type { AnyResolvedReference } from "../analysis/reference.js";
import type { AnalysisResult } from "../analysis/result.js";
import { WorkspaceDocumentStore } from "./document-store.js";
import { ModuleGraph } from "./module-graph.js";
import { WorkspaceSymbolIndex } from "./symbol-index.js";

interface CachedAnalysis {
    version: number;
    analysis: AnalysisResult;
}

interface CachedModuleIndex {
    version: number;
    index: ModuleIndex;
}

const logger = createLogger("workspace-analysis");

export class WorkspaceIndex {
    private readonly moduleGraph = new ModuleGraph();
    private readonly symbols = new WorkspaceSymbolIndex();
    private readonly analyses = new Map<DocumentUri, CachedAnalysis>();
    private readonly moduleIndexes = new Map<DocumentUri, CachedModuleIndex>();
    private readonly failedAnalyses = new Set<DocumentUri>();

    public constructor(
        private readonly parser: ParserService,
        private readonly documents: WorkspaceDocumentStore = new WorkspaceDocumentStore(),
    ) {}

    public updateOpenDocument(document: TextDocument): void {
        if (!this.documents.updateOpenDocument(document)) return;
        this.invalidateAffected([document.uri]);
    }

    public removeOpenDocument(uri: DocumentUri): void {
        if (!this.documents.removeOpenDocument(uri)) return;
        this.invalidateAffected([uri]);
    }

    public getAnalysis(document: TextDocument): AnalysisResult {
        this.updateOpenDocument(document);
        return this.analyse(document, new Set());
    }

    public replaceWorkspaceDocuments(uris: readonly DocumentUri[]): void {
        this.failedAnalyses.clear();
        const removedDocuments = this.documents.replaceWorkspaceDocuments(uris);
        logger.debug("Tracked documents:", this.documents.getTrackedDocumentUris());
        for (const uri of removedDocuments) this.parser.clear(uri);
        this.invalidateAffected(removedDocuments);
        for (const uri of removedDocuments) {
            this.moduleGraph.removeOutgoingDependencies(uri);
        }
    }

    public updateWorkspaceDocuments(changes: readonly FileEvent[]): void {
        const changedUris = changes.map((change) => change.uri);
        for (const uri of changedUris) this.parser.clear(uri);
        this.invalidateAffected(changedUris);

        this.documents.updateWorkspaceDocuments(changes);
        logger.debug("Tracked documents:", this.documents.getTrackedDocumentUris());
        for (const change of changes) {
            if (change.type === FileChangeType.Deleted) {
                this.moduleGraph.removeOutgoingDependencies(change.uri);
            }
        }
    }

    private analyse(document: TextDocument, visiting: Set<DocumentUri>): AnalysisResult {
        const cached = this.analyses.get(document.uri);
        if (cached?.version === document.version) return cached.analysis;

        const nextVisiting = new Set(visiting).add(document.uri);
        const index = this.getModuleIndex(document);

        const provider: ModuleProvider = {
            loadImport: (_importerUri, imported) => {
                return this.documents.loadImport(document, imported).map((loaded) => {
                    if (loaded.document !== undefined && !nextVisiting.has(loaded.document.uri)) {
                        this.analyse(loaded.document, nextVisiting);
                    }
                    return {
                        locationUri: loaded.locationUri,
                        range: loaded.range,
                        targetUri: loaded.targetUri,
                        moduleIndex:
                            loaded.document !== undefined
                                ? this.getModuleIndex(loaded.document)
                                : undefined,
                    };
                });
            },
        };

        const importResult = resolveImports(document.uri, index, provider);
        this.moduleGraph.replaceDependencies(document.uri, importResult.dependencies);

        const analysis = analyzeDocument(document, this.parser.parse(document).ast, {
            resolvedImports: importResult.resolvedImports,
        });
        const result: AnalysisResult = {
            ...analysis,
            diagnostics: [...importResult.diagnostics, ...analysis.diagnostics],
        };
        this.analyses.set(document.uri, { version: document.version, analysis: result });
        this.failedAnalyses.delete(document.uri);
        this.symbols.update(document.uri, result);
        return result;
    }

    private getModuleIndex(document: TextDocument): ModuleIndex {
        const cached = this.moduleIndexes.get(document.uri);
        if (cached?.version === document.version) return cached.index;

        const index = buildModuleIndex(document.uri, this.parser.parse(document).ast);
        this.moduleIndexes.set(document.uri, { version: document.version, index });
        return index;
    }

    public getReferencesToDefinition(definition: Definition): readonly AnyResolvedReference[] {
        if (definition.origin !== "source") return [];

        this.ensureDocumentsAnalysed(this.documents.getTrackedDocumentUris());

        return this.symbols.referencesTo(definition);
    }

    private ensureDocumentsAnalysed(uris: readonly DocumentUri[]): void {
        for (const uri of new Set(uris)) {
            if (this.analyses.has(uri) || this.failedAnalyses.has(uri)) continue;
            try {
                const document = this.documents.load(uri);
                if (document === undefined) {
                    this.failedAnalyses.add(uri);
                    continue;
                }
                this.analyse(document, new Set());
            } catch (error) {
                this.failedAnalyses.add(uri);
                logger.warn(`Could not index workspace document '${uri}'.`, error);
            }
        }
    }

    private invalidateAffected(uris: readonly DocumentUri[]): ReadonlySet<DocumentUri> {
        const affected = this.moduleGraph.affectedBy(uris);
        for (const uri of affected) {
            this.analyses.delete(uri);
            this.failedAnalyses.delete(uri);
            this.symbols.remove(uri);
        }
        for (const uri of uris) this.moduleIndexes.delete(uri);
        return affected;
    }
}
