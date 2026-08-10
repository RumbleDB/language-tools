import { existsSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { clearParsedDocument } from "server/parser/index.js";
import { DiagnosticSeverity, type DocumentUri } from "vscode-languageserver";
import { TextDocument } from "vscode-languageserver-textdocument";

import { analyzeDocument, type AnalysisResult, type ResolvedModuleImport } from "./builder.js";
import {
    definitionNameToString,
    type Definition,
    type SourceDefinition,
    type SourceModuleExportDefinition,
} from "./definitions.js";
import { buildDocumentIndex, type DocumentIndex } from "./document-index.js";
import type { ModuleImport } from "./module-info.js";
import type { AnyResolvedReference } from "./reference.js";

interface CachedAnalysis {
    version: number;
    analysis: AnalysisResult;
}

interface CachedDocumentIndex {
    version: number;
    index: DocumentIndex;
}

/**
 * Resolves local `at` locations and analyses direct library-module dependencies.
 * Open editor buffers always take precedence over their on-disk counterpart.
 */
class WorkspaceModuleService {
    private readonly openDocuments = new Map<DocumentUri, TextDocument>();
    private readonly cache = new Map<DocumentUri, CachedAnalysis>();
    private readonly indexes = new Map<DocumentUri, CachedDocumentIndex>();

    public updateOpenDocument(document: TextDocument): void {
        const current = this.openDocuments.get(document.uri);
        if (current?.version === document.version && current.getText() === document.getText())
            return;
        this.openDocuments.set(document.uri, document);
        // Imports may reference this document from any open module. Until the
        // dependency graph has targeted invalidation, invalidate conservatively.
        this.cache.clear();
        this.indexes.clear();
    }

    public removeOpenDocument(uri: DocumentUri): void {
        this.openDocuments.delete(uri);
        this.cache.clear();
        this.indexes.clear();
    }

    public invalidateDocuments(uris: readonly DocumentUri[]): void {
        for (const uri of uris) clearParsedDocument(uri);
        this.cache.clear();
        this.indexes.clear();
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
        const importDiagnostics: AnalysisResult["diagnostics"] = [];
        const importedNamespaces = new Set<string>();

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

            const loadedModules = this.loadImports(document, imported);
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

        const analysis = analyzeDocument(index, { resolvedImports });
        analysis.diagnostics.unshift(...importDiagnostics);
        this.cache.set(document.uri, { version: document.version, analysis });
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

        const targetKey = sourceDefinitionKey(definition);
        const references: AnyResolvedReference[] = [];
        for (const { analysis } of this.cache.values()) {
            for (const reference of analysis.references) {
                if (
                    reference.declaration.origin === "source" &&
                    sourceDefinitionKey(reference.declaration) === targetKey
                ) {
                    references.push(reference);
                }
            }
        }
        return references;
    }

    private loadImports(importer: TextDocument, imported: ModuleImport): TextDocument[] {
        const modules: TextDocument[] = [];
        const seenUris = new Set<string>();
        for (const location of imported.locations) {
            let uri: string;
            try {
                uri = new URL(location.uri, importer.uri).toString();
            } catch {
                continue;
            }
            if (seenUris.has(uri)) continue;
            seenUris.add(uri);
            const open = this.openDocuments.get(uri);
            if (open !== undefined) {
                modules.push(open);
                continue;
            }
            if (!uri.startsWith("file:")) continue;
            const path = fileURLToPath(uri);
            if (!existsSync(path)) continue;
            modules.push(
                TextDocument.create(uri, languageIdFor(path), 0, readFileSync(path, "utf8")),
            );
        }
        return modules;
    }
}

function sourceDefinitionKey(definition: SourceDefinition): string {
    const { start, end } = definition.selectionRange;
    return `${definition.uri}:${definition.kind}:${start.line}:${start.character}:${end.line}:${end.character}`;
}

function languageIdFor(path: string): string {
    return path.endsWith(".xq") || path.endsWith(".xqm") ? "xquery" : "jsoniq";
}

const workspaceModules = new WorkspaceModuleService();

export function getAnalysis(document: TextDocument): AnalysisResult {
    return workspaceModules.getAnalysis(document);
}
export function updateOpenDocument(document: TextDocument): void {
    workspaceModules.updateOpenDocument(document);
}
export function removeOpenDocument(uri: DocumentUri): void {
    workspaceModules.removeOpenDocument(uri);
}
export function invalidateModuleDocuments(uris: readonly DocumentUri[]): void {
    workspaceModules.invalidateDocuments(uris);
}
export function getWorkspaceReferencesToDefinition(
    definition: Definition,
): readonly AnyResolvedReference[] {
    return workspaceModules.getReferencesToDefinition(definition);
}
