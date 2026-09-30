import { ParserService } from "server/parser/index.js";
import { getActiveParserId } from "server/parser/utils.js";
import { resolveBuiltin } from "server/resources/builtins.js";
import { createLogger } from "server/utils/logger.js";
import type { DocumentUri } from "vscode-languageserver";
import { TextDocument } from "vscode-languageserver-textdocument";
import { FileChangeType, type FileEvent } from "vscode-languageserver/node";

import type { Definition } from "../analysis/model/definitions.js";
import type { ModuleImport } from "../analysis/model/module-info.js";
import type { AnyResolvedReference } from "../analysis/model/reference.js";
import type { AnalysisResult } from "../analysis/model/result.js";
import { analyzeModule } from "../analysis/pipeline.js";
import type {
    ModuleProvider,
    ResolvedImportTarget,
} from "../analysis/resolution/import-resolution.js";
import { collectModuleProlog, type ModuleProlog } from "../analysis/resolution/module-prolog.js";
import { WorkspaceDocumentStore } from "./document-store.js";
import { ModuleGraph } from "./module-graph.js";
import { WorkspaceSymbolIndex } from "./symbol-index.js";

interface CachedAnalysis {
    version: number;
    analysis: Promise<AnalysisResult>;
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
        const snapshot = TextDocument.create(
            document.uri,
            document.languageId,
            document.version,
            document.getText(),
        );
        if (!this.documents.updateOpenDocument(snapshot)) return;
        this.invalidateAffected([document.uri]);
    }

    public removeOpenDocument(uri: DocumentUri): void {
        if (!this.documents.removeOpenDocument(uri)) return;
        this.invalidateAffected([uri]);
    }

    public getAnalysis(document: TextDocument): Promise<AnalysisResult> {
        this.updateOpenDocument(document);
        return this.analyse(this.documents.load(document.uri)!);
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

    private async analyse(document: TextDocument): Promise<AnalysisResult> {
        const cached = this.analyses.get(document.uri);
        if (cached?.version === document.version) return cached.analysis;

        // Capture syntax and imports before yielding to document changes.
        const ast = this.parser.parse(document).ast;
        const prolog = this.getProlog(document);
        const { provider, dependencies } = this.prepareImports(document, prolog);
        // File changes must invalidate pending analysis as well as completed analysis.
        this.moduleGraph.replaceDependencies(document.uri, dependencies);
        const entry: CachedAnalysis = {
            version: document.version,
            analysis: Promise.resolve().then(() => {
                const language = getActiveParserId(document);
                const { analysis } = analyzeModule(document, ast, {
                    provider,
                    prolog,
                    resolveBuiltin: (kind, name) => resolveBuiltin(kind, name, language),
                });
                if (this.analyses.get(document.uri) === entry) {
                    this.failedAnalyses.delete(document.uri);
                    this.symbols.update(document.uri, analysis);
                }
                return analysis;
            }),
        };
        this.analyses.set(document.uri, entry);
        try {
            return await entry.analysis;
        } catch (error) {
            if (this.analyses.get(document.uri) === entry) this.analyses.delete(document.uri);
            throw error;
        }
    }

    private prepareImports(
        document: TextDocument,
        prolog: ModuleProlog,
    ): { provider: ModuleProvider; dependencies: ReadonlySet<DocumentUri> } {
        const resolvedTargets = new Map<ModuleImport, readonly ResolvedImportTarget[]>();
        const dependencies = new Set<DocumentUri>();
        for (const imported of prolog.imports) {
            const targets = this.documents.loadImport(document, imported);
            resolvedTargets.set(
                imported,
                targets.map((loaded) => {
                    if (loaded.targetUri !== undefined) dependencies.add(loaded.targetUri);
                    return {
                        locationUri: loaded.locationUri,
                        range: loaded.range,
                        targetUri: loaded.targetUri,
                        prolog:
                            loaded.document === undefined
                                ? undefined
                                : this.getProlog(loaded.document),
                    };
                }),
            );
        }
        return {
            provider: { loadImport: (_uri, imported) => resolvedTargets.get(imported) ?? [] },
            dependencies,
        };
    }

    private getProlog(document: TextDocument): ModuleProlog {
        const cached = this.prologs.get(document.uri);
        if (cached?.version === document.version) return cached.prolog;

        const prolog = collectModuleProlog(document.uri, this.parser.parse(document).ast);
        this.prologs.set(document.uri, { version: document.version, prolog });
        return prolog;
    }

    public async getReferencesToDefinition(
        definition: Definition,
    ): Promise<readonly AnyResolvedReference[]> {
        if (definition.origin !== "source") return [];

        await this.ensureDocumentsAnalysed(this.documents.getTrackedDocumentUris());

        return this.symbols.referencesTo(definition);
    }

    private async ensureDocumentsAnalysed(uris: readonly DocumentUri[]): Promise<void> {
        const pending = new Set(uris);
        for (const uri of pending) {
            if (this.failedAnalyses.has(uri)) continue;
            try {
                const document = this.documents.load(uri);
                if (document === undefined) {
                    this.failedAnalyses.add(uri);
                    continue;
                }
                await this.analyse(document);
                // Imported modules may be outside the scanned workspace folders.
                for (const imported of this.getProlog(document).imports) {
                    for (const target of this.documents.loadImport(document, imported)) {
                        if (target.document !== undefined) pending.add(target.document.uri);
                    }
                }
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
