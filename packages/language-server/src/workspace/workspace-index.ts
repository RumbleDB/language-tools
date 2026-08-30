import { ParserService } from "server/parser/index.js";
import { resolveBuiltin } from "server/resources/builtins.js";
import { createLogger } from "server/utils/logger.js";
import type { DocumentUri } from "vscode-languageserver";
import { TextDocument } from "vscode-languageserver-textdocument";
import { FileChangeType, type FileEvent } from "vscode-languageserver/node";

import type { Definition } from "../analysis/model/definitions.js";
import type { AnyResolvedReference } from "../analysis/model/reference.js";
import type { AnalysisResult } from "../analysis/model/result.js";
import { analyzeModule } from "../analysis/pipeline.js";
import type { ModuleProvider } from "../analysis/resolution/import-resolution.js";
import { collectModuleProlog, type ModuleProlog } from "../analysis/resolution/module-prolog.js";
import { WorkspaceDocumentStore } from "./document-store.js";
import { ModuleGraph } from "./module-graph.js";
import { WorkspaceSymbolIndex } from "./symbol-index.js";

interface CachedAnalysis {
    version: number;
    analysis: AnalysisResult;
}

interface CachedProlog {
    version: number;
    prolog: ModuleProlog;
}

const logger = createLogger("workspace-analysis");

export class WorkspaceIndex {
    private readonly moduleGraph = new ModuleGraph();
    private readonly symbols = new WorkspaceSymbolIndex();
    private readonly analyses = new Map<DocumentUri, CachedAnalysis>();
    private readonly prologs = new Map<DocumentUri, CachedProlog>();
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

    public updateWorkspaceDocuments(changes: readonly FileEvent[]): ReadonlySet<DocumentUri> {
        const changedUris = changes.map((change) => change.uri);
        for (const uri of changedUris) this.parser.clear(uri);
        const affected = this.invalidateAffected(changedUris);

        this.documents.updateWorkspaceDocuments(changes);
        logger.debug("Tracked documents:", this.documents.getTrackedDocumentUris());
        for (const change of changes) {
            if (change.type === FileChangeType.Deleted) {
                this.moduleGraph.removeOutgoingDependencies(change.uri);
            }
        }
        return affected;
    }

    private analyse(document: TextDocument, visiting: Set<DocumentUri>): AnalysisResult {
        const cached = this.analyses.get(document.uri);
        if (cached?.version === document.version) return cached.analysis;

        const nextVisiting = new Set(visiting).add(document.uri);
        const prolog = this.getProlog(document);
        const provider = this.createModuleProvider(document, nextVisiting);

        const { analysis, dependencies } = analyzeModule(
            document,
            this.parser.parse(document).ast,
            {
                provider,
                prolog,
                resolveBuiltin,
            },
        );

        this.moduleGraph.replaceDependencies(document.uri, dependencies);
        this.analyses.set(document.uri, { version: document.version, analysis });
        this.failedAnalyses.delete(document.uri);
        this.symbols.update(document.uri, analysis);
        return analysis;
    }

    private createModuleProvider(
        document: TextDocument,
        visiting: Set<DocumentUri>,
    ): ModuleProvider {
        return {
            loadImport: (_importerUri, imported) => {
                return this.documents.loadImport(document, imported).map((loaded) => {
                    if (loaded.document !== undefined && !visiting.has(loaded.document.uri)) {
                        this.analyse(loaded.document, visiting);
                    }
                    return {
                        locationUri: loaded.locationUri,
                        range: loaded.range,
                        targetUri: loaded.targetUri,
                        prolog:
                            loaded.document !== undefined
                                ? this.getProlog(loaded.document)
                                : undefined,
                    };
                });
            },
        };
    }

    private getProlog(document: TextDocument): ModuleProlog {
        const cached = this.prologs.get(document.uri);
        if (cached?.version === document.version) return cached.prolog;

        const prolog = collectModuleProlog(document.uri, this.parser.parse(document).ast);
        this.prologs.set(document.uri, { version: document.version, prolog });
        return prolog;
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
        for (const uri of uris) this.prologs.delete(uri);
        return affected;
    }
}
