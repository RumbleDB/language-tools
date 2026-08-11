import { clearParsedDocument } from "server/parser/index.js";
import { createLogger } from "server/utils/logger.js";
import { DiagnosticSeverity, type Diagnostic, type DocumentUri } from "vscode-languageserver";
import { TextDocument } from "vscode-languageserver-textdocument";

import { analyzeDocument, type AnalysisResult, type ResolvedModuleImport } from "./builder.js";
import {
    definitionNameToString,
    type Definition,
    type SourceModuleExportDefinition,
} from "./definitions.js";
import { buildDocumentIndex, type DocumentIndex } from "./document-index.js";
import { ModuleGraph } from "./module-graph.js";
import { WorkspaceDocumentStore } from "./module-loader.js";
import type { AnyResolvedReference } from "./reference.js";
import { isSupportedSourceUri } from "./workspace-files.js";
import { WorkspaceSymbolIndex } from "./workspace-symbol-index.js";

export interface WorkspaceDocumentChange {
    readonly uri: DocumentUri;
    readonly kind: "created" | "changed" | "deleted";
}

interface CachedAnalysis {
    version: number;
    analysis: AnalysisResult;
}

interface CachedDocumentIndex {
    version: number;
    index: DocumentIndex;
}

const logger = createLogger("workspace-analysis");

export class WorkspaceAnalysisCoordinator {
    private readonly moduleGraph = new ModuleGraph();
    private readonly symbols = new WorkspaceSymbolIndex();
    private readonly cache = new Map<DocumentUri, CachedAnalysis>();
    private readonly indexes = new Map<DocumentUri, CachedDocumentIndex>();
    private readonly workspaceDocuments = new Set<DocumentUri>();
    private readonly failedDocuments = new Set<DocumentUri>();

    public constructor(
        private readonly documents: WorkspaceDocumentStore = new WorkspaceDocumentStore(),
    ) {}

    public updateOpenDocument(document: TextDocument): void {
        if (!this.documents.update(document)) return;
        this.invalidateAffected([document.uri]);
    }

    public removeOpenDocument(uri: DocumentUri): void {
        if (!this.documents.remove(uri)) return;
        this.invalidateAffected([uri]);
    }

    public getAnalysis(document: TextDocument): AnalysisResult {
        this.updateOpenDocument(document);
        return this.analyse(document, new Set());
    }

    public replaceWorkspaceDocuments(uris: readonly DocumentUri[]): void {
        this.failedDocuments.clear();
        const nextDocuments = new Set(uris);
        const removedDocuments = [...this.workspaceDocuments].filter(
            (uri) => !nextDocuments.has(uri),
        );
        for (const uri of removedDocuments) clearParsedDocument(uri);
        this.invalidateAffected(removedDocuments);
        for (const uri of removedDocuments) {
            this.moduleGraph.removeOutgoingDependencies(uri);
        }

        this.workspaceDocuments.clear();
        for (const uri of nextDocuments) this.workspaceDocuments.add(uri);
        this.ensureDocumentsAnalysed([
            ...this.workspaceDocuments,
            ...this.documents.getOpenDocuments().map((document) => document.uri),
        ]);
    }

    public updateWorkspaceDocuments(changes: readonly WorkspaceDocumentChange[]): void {
        const changedUris = changes.map((change) => change.uri);
        for (const uri of changedUris) clearParsedDocument(uri);
        const affected = this.invalidateAffected(changedUris);

        for (const change of changes) {
            if (change.kind === "deleted") {
                this.workspaceDocuments.delete(change.uri);
                this.moduleGraph.removeOutgoingDependencies(change.uri);
            } else if (isSupportedSourceUri(change.uri)) {
                this.workspaceDocuments.add(change.uri);
            }
        }

        this.ensureDocumentsAnalysed([...affected]);
    }

    private analyse(document: TextDocument, visiting: Set<DocumentUri>): AnalysisResult {
        const cached = this.cache.get(document.uri);
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
                        range: imported.namespaceUriRange,
                    });
                    continue;
                }
                foundValidModule = true;
                for (const [name, exported] of dependencyIndex.moduleInterface.exports) {
                    const namespaceUri =
                        exported.kind === "function"
                            ? exported.name.qname.namespaceUri
                            : exported.name.namespaceUri;
                    if (namespaceUri !== imported.namespaceUri) {
                        importDiagnostics.push({
                            severity: DiagnosticSeverity.Error,
                            code: "XQST0048",
                            message: `Export '${definitionNameToString(exported)}' is not in module namespace '${imported.namespaceUri}'.`,
                            range: imported.namespaceUriRange,
                        });
                        continue;
                    }
                    if (exports.has(name)) {
                        importDiagnostics.push({
                            severity: DiagnosticSeverity.Error,
                            code: exported.kind === "variable" ? "XQST0049" : "XQST0034",
                            message: `Module export '${name}' is defined more than once.`,
                            range: imported.namespaceUriRange,
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
        this.cache.set(document.uri, { version: document.version, analysis });
        this.failedDocuments.delete(document.uri);
        this.symbols.update(document.uri, analysis);
        return analysis;
    }

    private getDocumentIndex(document: TextDocument): DocumentIndex {
        const cached = this.indexes.get(document.uri);
        if (cached?.version === document.version) return cached.index;

        const index = buildDocumentIndex(document);
        this.indexes.set(document.uri, { version: document.version, index });
        return index;
    }

    public getReferencesToDefinition(definition: Definition): readonly AnyResolvedReference[] {
        if (definition.origin !== "source") return [];

        this.ensureDocumentsAnalysed([
            ...this.workspaceDocuments,
            ...this.documents.getOpenDocuments().map((document) => document.uri),
        ]);

        return this.symbols.referencesTo(definition);
    }

    private ensureDocumentsAnalysed(uris: readonly DocumentUri[]): void {
        for (const uri of new Set(uris)) {
            if (this.cache.has(uri) || this.failedDocuments.has(uri)) continue;
            try {
                const document = this.documents.load(uri);
                if (document === undefined) {
                    this.failedDocuments.add(uri);
                    continue;
                }
                this.analyse(document, new Set());
            } catch (error) {
                this.failedDocuments.add(uri);
                logger.warn(`Could not index workspace document '${uri}'.`, error);
            }
        }
    }

    private invalidateAffected(uris: readonly DocumentUri[]): ReadonlySet<DocumentUri> {
        const affected = this.moduleGraph.affectedBy(uris);
        for (const uri of affected) {
            this.cache.delete(uri);
            this.failedDocuments.delete(uri);
            this.symbols.remove(uri);
        }
        for (const uri of uris) this.indexes.delete(uri);
        return affected;
    }
}

const workspaceAnalysis = new WorkspaceAnalysisCoordinator();

export function getAnalysis(document: TextDocument): AnalysisResult {
    return workspaceAnalysis.getAnalysis(document);
}
export function replaceWorkspaceDocuments(uris: readonly DocumentUri[]): void {
    workspaceAnalysis.replaceWorkspaceDocuments(uris);
}
export function updateWorkspaceDocuments(changes: readonly WorkspaceDocumentChange[]): void {
    workspaceAnalysis.updateWorkspaceDocuments(changes);
}
export function updateOpenDocument(document: TextDocument): void {
    workspaceAnalysis.updateOpenDocument(document);
}
export function removeOpenDocument(uri: DocumentUri): void {
    workspaceAnalysis.removeOpenDocument(uri);
}
export function getWorkspaceReferencesToDefinition(
    definition: Definition,
): readonly AnyResolvedReference[] {
    return workspaceAnalysis.getReferencesToDefinition(definition);
}
