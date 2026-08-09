import { existsSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { clearParsedDocument, parseDocument } from "server/parser/index.js";
import type { AstNode as ParserAstNode } from "server/parser/types/ast.js";
import { DiagnosticSeverity, type DocumentUri } from "vscode-languageserver";
import { TextDocument } from "vscode-languageserver-textdocument";

import { buildAnalysis, type AnalysisResult, type ResolvedModuleImport } from "./builder.js";
import { definitionNameToString, type SourceModuleExportDefinition } from "./definitions.js";
import { collectModuleExports } from "./queries.js";

interface CachedAnalysis {
    version: number;
    analysis: AnalysisResult;
}

/**
 * Resolves local `at` locations and analyses direct library-module dependencies.
 * Open editor buffers always take precedence over their on-disk counterpart.
 */
class WorkspaceModuleService {
    private readonly openDocuments = new Map<DocumentUri, TextDocument>();
    private readonly cache = new Map<DocumentUri, CachedAnalysis>();
    private readonly provisionalAnalyses = new Map<DocumentUri, AnalysisResult>();

    public updateOpenDocument(document: TextDocument): void {
        const current = this.openDocuments.get(document.uri);
        if (current?.version === document.version && current.getText() === document.getText())
            return;
        this.openDocuments.set(document.uri, document);
        // Imports may reference this document from any open module. Until the
        // dependency graph has targeted invalidation, invalidate conservatively.
        this.cache.clear();
        this.provisionalAnalyses.clear();
    }

    public removeOpenDocument(uri: DocumentUri): void {
        this.openDocuments.delete(uri);
        this.cache.clear();
        this.provisionalAnalyses.clear();
    }

    public invalidateDocuments(uris: readonly DocumentUri[]): void {
        for (const uri of uris) clearParsedDocument(uri);
        this.cache.clear();
        this.provisionalAnalyses.clear();
    }

    public getAnalysis(document: TextDocument): AnalysisResult {
        this.updateOpenDocument(document);
        return this.analyse(document, new Set());
    }

    private analyse(document: TextDocument, visiting: Set<DocumentUri>): AnalysisResult {
        const cached = this.cache.get(document.uri);
        if (cached?.version === document.version) return cached.analysis;

        if (visiting.has(document.uri)) {
            const provisional =
                this.provisionalAnalyses.get(document.uri) ?? buildAnalysis(document);
            this.provisionalAnalyses.set(document.uri, provisional);
            return provisional;
        }
        const nextVisiting = new Set(visiting).add(document.uri);
        const imports = findNodes(parseDocument(document).ast, "module-import");
        const resolvedImports: ResolvedModuleImport[] = [];
        const importDiagnostics: AnalysisResult["diagnostics"] = [];
        const importedNamespaces = new Set<string>();

        for (const imported of imports) {
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
                const dependency = this.analyse(loaded, nextVisiting);
                const declaration = findNodes(parseDocument(loaded).ast, "module-declaration")[0];
                if (
                    declaration === undefined ||
                    declaration.namespaceUri !== imported.namespaceUri
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
                for (const exported of collectModuleExports(dependency)) {
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

        const analysis = buildAnalysis(document, resolvedImports);
        analysis.diagnostics.unshift(...importDiagnostics);
        this.reconcileProvisionalReferences(document.uri, analysis);
        this.cache.set(document.uri, { version: document.version, analysis });
        return analysis;
    }

    private reconcileProvisionalReferences(uri: DocumentUri, analysis: AnalysisResult): void {
        const provisional = this.provisionalAnalyses.get(uri);
        if (provisional === undefined) return;

        const finalExports = new Map(
            collectModuleExports(analysis).map((definition) => [
                definitionNameToString(definition, true),
                definition,
            ]),
        );
        for (const provisionalDefinition of collectModuleExports(provisional)) {
            const finalDefinition = finalExports.get(
                definitionNameToString(provisionalDefinition, true),
            );
            if (finalDefinition === undefined) continue;
            for (const reference of provisionalDefinition.references) {
                if (reference.uri === uri) continue;
                reference.declaration = finalDefinition;
                finalDefinition.references.push(reference);
            }
        }
        this.provisionalAnalyses.delete(uri);
    }

    private loadImports(
        importer: TextDocument,
        imported: Extract<ParserAstNode, { kind: "module-import" }>,
    ): TextDocument[] {
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

function languageIdFor(path: string): string {
    return path.endsWith(".xq") || path.endsWith(".xqm") ? "xquery" : "jsoniq";
}

function findNodes<K extends ParserAstNode["kind"]>(
    node: ParserAstNode,
    kind: K,
): Array<Extract<ParserAstNode, { kind: K }>> {
    type MatchingNode = Extract<ParserAstNode, { kind: K }>;
    const found: MatchingNode[] = node.kind === kind ? [node as MatchingNode] : [];
    for (const child of node.children) found.push(...findNodes(child, kind));
    return found;
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
