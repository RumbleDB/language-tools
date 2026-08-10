import { clearParsedDocument } from "server/parser/index.js";
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
import { WorkspaceDocumentStore, type ModuleLoader } from "./module-loader.js";
import type { AnyResolvedReference } from "./reference.js";
import { WorkspaceSymbolIndex } from "./workspace-symbol-index.js";

interface CachedAnalysis {
    version: number;
    analysis: AnalysisResult;
}

interface CachedDocumentIndex {
    version: number;
    index: DocumentIndex;
}

class WorkspaceAnalysisCoordinator {
    private readonly moduleGraph = new ModuleGraph();
    private readonly symbols = new WorkspaceSymbolIndex();
    private readonly cache = new Map<DocumentUri, CachedAnalysis>();
    private readonly indexes = new Map<DocumentUri, CachedDocumentIndex>();

    public constructor(
        private readonly documents: WorkspaceDocumentStore = new WorkspaceDocumentStore(),
        private readonly moduleLoader: ModuleLoader = documents,
    ) {}

    public updateOpenDocument(document: TextDocument): void {
        if (!this.documents.update(document)) return;
        this.invalidateAffected([document.uri], true);
    }

    public removeOpenDocument(uri: DocumentUri): void {
        if (!this.documents.remove(uri)) return;
        this.invalidateAffected([uri], true);
    }

    public invalidateDocuments(uris: readonly DocumentUri[]): void {
        for (const uri of uris) clearParsedDocument(uri);
        this.invalidateAffected(uris, true);
    }

    public getAnalysis(document: TextDocument): AnalysisResult {
        this.updateOpenDocument(document);
        return this.analyse(document, new Set());
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

            const loadedModules = this.moduleLoader.loadImport(document, imported);
            if (loadedModules.length === 0) {
                importDiagnostics.push({
                    severity: DiagnosticSeverity.Error,
                    code: "XQST0059",
                    message: `Cannot resolve module '${imported.namespaceUri}'.`,
                    range: imported.locations[0]?.range ?? imported.namespaceUriRange,
                });
                continue;
            }
            const exports: SourceModuleExportDefinition[] = [];
            const exportNames = new Set<string>();
            let foundValidModule = false;
            for (const loaded of loadedModules) {
                dependencies.add(loaded.uri);
                const dependencyIndex = this.getDocumentIndex(loaded);
                if (!nextVisiting.has(loaded.uri)) {
                    this.analyse(loaded, nextVisiting);
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
                for (const exported of dependencyIndex.moduleInterface.exports) {
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
                    const name = definitionNameToString(exported, true);
                    if (exportNames.has(name)) {
                        importDiagnostics.push({
                            severity: DiagnosticSeverity.Error,
                            code: exported.kind === "variable" ? "XQST0049" : "XQST0034",
                            message: `Module export '${name}' is defined more than once.`,
                            range: imported.namespaceUriRange,
                        });
                        continue;
                    }
                    exportNames.add(name);
                    exports.push(exported);
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

        return this.symbols.referencesTo(definition);
    }

    private invalidateAffected(uris: readonly DocumentUri[], invalidateIndexes: boolean): void {
        const affected = this.moduleGraph.affectedBy(uris);
        for (const uri of affected) {
            this.cache.delete(uri);
            this.symbols.remove(uri);
        }
        if (invalidateIndexes) {
            for (const uri of uris) this.indexes.delete(uri);
        }
    }
}

const workspaceAnalysis = new WorkspaceAnalysisCoordinator();

export function getAnalysis(document: TextDocument): AnalysisResult {
    return workspaceAnalysis.getAnalysis(document);
}
export function updateOpenDocument(document: TextDocument): void {
    workspaceAnalysis.updateOpenDocument(document);
}
export function removeOpenDocument(uri: DocumentUri): void {
    workspaceAnalysis.removeOpenDocument(uri);
}
export function invalidateModuleDocuments(uris: readonly DocumentUri[]): void {
    workspaceAnalysis.invalidateDocuments(uris);
}
export function getWorkspaceReferencesToDefinition(
    definition: Definition,
): readonly AnyResolvedReference[] {
    return workspaceAnalysis.getReferencesToDefinition(definition);
}
