import { existsSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { parseDocument } from "server/parser/index.js";
import type {
    AstNode as ParserAstNode,
    ModuleDeclarationAstNode,
    ModuleImportAstNode,
} from "server/parser/types/ast.js";
import { DiagnosticSeverity, type DocumentUri } from "vscode-languageserver";
import { TextDocument } from "vscode-languageserver-textdocument";

import { buildAnalysis, type AnalysisResult, type ImportedModule } from "./builder.js";
import { collectDefinitions } from "./queries.js";

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

    public updateOpenDocument(document: TextDocument): void {
        const current = this.openDocuments.get(document.uri);
        if (current?.version === document.version && current.getText() === document.getText())
            return;
        this.openDocuments.set(document.uri, document);
        this.cache.delete(document.uri);
    }

    public removeOpenDocument(uri: DocumentUri): void {
        this.openDocuments.delete(uri);
        this.cache.delete(uri);
    }

    public getAnalysis(document: TextDocument): AnalysisResult {
        this.updateOpenDocument(document);
        return this.analyse(document, new Set());
    }

    private analyse(document: TextDocument, visiting: Set<DocumentUri>): AnalysisResult {
        const cached = this.cache.get(document.uri);
        if (cached?.version === document.version) return cached.analysis;

        // A cycle is valid in XQuery; defer its exports until the containing analysis
        // completes instead of recursively constructing another module instance.
        if (visiting.has(document.uri)) return buildAnalysis(document);
        const nextVisiting = new Set(visiting).add(document.uri);
        const imports = findNodes<ModuleImportAstNode>(
            parseDocument(document).ast,
            "module-import",
        );
        const importedModules: ImportedModule[] = [];
        const importDiagnostics: AnalysisResult["diagnostics"] = [];

        for (const imported of imports) {
            const loaded = this.loadImport(document, imported);
            if (loaded === undefined) {
                importDiagnostics.push({
                    severity: DiagnosticSeverity.Error,
                    code: "unresolved-module-import",
                    message: `Cannot resolve module '${imported.namespaceUri}'.`,
                    range: imported.locations[0]?.range ?? imported.namespaceUriRange,
                });
                continue;
            }
            const dependency = this.analyse(loaded, nextVisiting);
            const declaration = findNodes<ModuleDeclarationAstNode>(
                parseDocument(loaded).ast,
                "module-declaration",
            )[0];
            if (declaration === undefined || declaration.namespaceUri !== imported.namespaceUri) {
                importDiagnostics.push({
                    severity: DiagnosticSeverity.Error,
                    code: "module-namespace-mismatch",
                    message: `Imported module must declare namespace '${imported.namespaceUri}'.`,
                    range: imported.namespaceUriRange,
                });
                continue;
            }
            importedModules.push({
                namespaceUri: imported.namespaceUri,
                ...(imported.prefix === undefined ? {} : { prefix: imported.prefix }),
                declarations: collectDefinitions(dependency),
            });
        }

        const analysis = buildAnalysis(document, importedModules);
        analysis.diagnostics.push(...importDiagnostics);
        this.cache.set(document.uri, { version: document.version, analysis });
        return analysis;
    }

    private loadImport(
        importer: TextDocument,
        imported: ModuleImportAstNode,
    ): TextDocument | undefined {
        for (const location of imported.locations) {
            let uri: string;
            try {
                uri = new URL(location.uri, importer.uri).toString();
            } catch {
                continue;
            }
            const open = this.openDocuments.get(uri);
            if (open !== undefined) return open;
            if (!uri.startsWith("file:")) continue;
            const path = fileURLToPath(uri);
            if (!existsSync(path)) continue;
            return TextDocument.create(uri, languageIdFor(path), 0, readFileSync(path, "utf8"));
        }
        return undefined;
    }
}

function languageIdFor(path: string): string {
    return path.endsWith(".xq") || path.endsWith(".xqm") ? "xquery" : "jsoniq";
}

function findNodes<T extends ParserAstNode>(node: ParserAstNode, kind: T["kind"]): T[] {
    const found: T[] = node.kind === kind ? [node as T] : [];
    for (const child of node.children) found.push(...findNodes<T>(child, kind));
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
