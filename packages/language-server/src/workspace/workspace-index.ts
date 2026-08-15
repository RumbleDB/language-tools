import { ParserService } from "server/parser/index.js";
import { createLogger } from "server/utils/logger.js";
import { DiagnosticSeverity, type Diagnostic, type DocumentUri } from "vscode-languageserver";
import { TextDocument } from "vscode-languageserver-textdocument";
import { FileChangeType, type FileEvent } from "vscode-languageserver/node";

import {
    analyzeDocument,
    type AnalysisResult,
    type ResolvedModuleImport,
} from "../analysis/builder.js";
import { type Definition, type SourceModuleExportDefinition } from "../analysis/definitions.js";
import { buildDocumentIndex, type DocumentIndex } from "../analysis/document-index.js";
import type { AnyResolvedReference } from "../analysis/reference.js";
import { WorkspaceDocumentStore } from "./document-store.js";
import { ModuleGraph } from "./module-graph.js";
import { WorkspaceSymbolIndex } from "./symbol-index.js";

interface CachedAnalysis {
    version: number;
    analysis: AnalysisResult;
}

interface CachedDocumentIndex {
    version: number;
    index: DocumentIndex;
}

const logger = createLogger("workspace-analysis");

export class WorkspaceIndex {
    private readonly moduleGraph = new ModuleGraph();
    private readonly symbols = new WorkspaceSymbolIndex();
    private readonly analyses = new Map<DocumentUri, CachedAnalysis>();
    private readonly documentIndexes = new Map<DocumentUri, CachedDocumentIndex>();
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

        this.ensureDocumentsAnalysed(this.documents.getTrackedDocumentUris());
    }

    public updateWorkspaceDocuments(changes: readonly FileEvent[]): void {
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

        this.ensureDocumentsAnalysed([...affected]);
    }

    private analyse(document: TextDocument, visiting: Set<DocumentUri>): AnalysisResult {
        const cached = this.analyses.get(document.uri);
        if (cached?.version === document.version) return cached.analysis;

        const nextVisiting = new Set(visiting).add(document.uri);
        const index = this.getDocumentIndex(document);
        const resolvedImports: ResolvedModuleImport[] = [];
        const importDiagnostics: Diagnostic[] = [];
        const importedNamespaces = new Set<string>();
        const dependencies = new Set<DocumentUri>();

        for (const imported of index.moduleDeclaration.imports) {
            if (imported.namespaceUri.length === 0) {
                importDiagnostics.push({
                    severity: DiagnosticSeverity.Error,
                    code: "XQST0088",
                    message: "A module import target namespace cannot be empty.",
                    range: imported.namespaceUriRange,
                });
                continue;
            }
            if (imported.prefix === "xml" || imported.prefix === "xmlns") {
                importDiagnostics.push({
                    severity: DiagnosticSeverity.Error,
                    code: "XQST0070",
                    message: `Prefix '${imported.prefix}' cannot be used for a module import.`,
                    range: imported.range,
                });
                continue;
            }
            if (importedNamespaces.has(imported.namespaceUri)) {
                importDiagnostics.push({
                    severity: DiagnosticSeverity.Error,
                    code: "XQST0047",
                    message: `Module namespace '${imported.namespaceUri}' is imported more than once.`,
                    range: imported.namespaceUriRange,
                });
                continue;
            }
            importedNamespaces.add(imported.namespaceUri);

            const exports = new Map<string, SourceModuleExportDefinition>();
            let foundValidModule = false;
            for (const loaded of this.documents.loadImport(document, imported)) {
                if (loaded.targetUri !== undefined) dependencies.add(loaded.targetUri);
                if (loaded.document === undefined) {
                    importDiagnostics.push({
                        severity: DiagnosticSeverity.Error,
                        code: "XQST0059",
                        message: `Cannot resolve module location '${loaded.locationUri}'.`,
                        range: loaded.range,
                    });
                    continue;
                }

                const dependency = loaded.document;
                const dependencyIndex = this.getDocumentIndex(dependency);
                if (!nextVisiting.has(dependency.uri)) {
                    // Populate the dependency graph and workspace reference index for the
                    // library itself. Its exports are already available from its document index.
                    this.analyse(dependency, nextVisiting);
                }
                if (
                    dependencyIndex.moduleDeclaration.kind !== "library" ||
                    dependencyIndex.moduleInterface?.namespaceUri !== imported.namespaceUri
                ) {
                    importDiagnostics.push({
                        severity: DiagnosticSeverity.Error,
                        code: "XQST0059",
                        message: `Imported module must declare namespace '${imported.namespaceUri}'.`,
                        range: loaded.range,
                    });
                    continue;
                }
                foundValidModule = true;
                for (const [name, exported] of dependencyIndex.moduleInterface.exports) {
                    if (exports.has(name)) {
                        importDiagnostics.push({
                            severity: DiagnosticSeverity.Error,
                            code: exported.kind === "variable" ? "XQST0049" : "XQST0034",
                            message: `Module export '${name}' is defined more than once.`,
                            range: loaded.range,
                        });
                        continue;
                    }
                    exports.set(name, exported);
                }
            }
            if (foundValidModule) {
                resolvedImports.push({
                    targetNamespaceUri: imported.namespaceUri,
                    exports,
                });
            }
        }

        this.moduleGraph.replaceDependencies(document.uri, dependencies);

        const analysis = analyzeDocument(index, {
            resolvedImports,
            diagnostics: importDiagnostics,
        });
        this.analyses.set(document.uri, { version: document.version, analysis });
        this.failedAnalyses.delete(document.uri);
        this.symbols.update(document.uri, analysis);
        return analysis;
    }

    private getDocumentIndex(document: TextDocument): DocumentIndex {
        const cached = this.documentIndexes.get(document.uri);
        if (cached?.version === document.version) return cached.index;

        const index = buildDocumentIndex(document, this.parser.parse(document).ast);
        this.documentIndexes.set(document.uri, { version: document.version, index });
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
        for (const uri of uris) this.documentIndexes.delete(uri);
        return affected;
    }
}
