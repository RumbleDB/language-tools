import type { AstNode as ParserAstNode } from "server/parser/types/ast.js";
import type { DocumentUri } from "vscode-languageserver";
import type { TextDocument } from "vscode-languageserver-textdocument";

import { analyzeDocument } from "./builder.js";
import { resolveImports, type ModuleProvider } from "./import-resolution.js";
import type { ModuleIndex } from "./module-info.js";
import { collectModulePreamble, type ModulePreamble } from "./module-preamble.js";
import type { AnalysisResult } from "./result.js";

export interface AnalyzeModuleOptions {
    readonly provider: ModuleProvider;
    readonly preamble?: ModulePreamble;
}

export interface AnalyzeModuleResult {
    readonly analysis: AnalysisResult;
    readonly dependencies: ReadonlySet<DocumentUri>;
}

/**
 * Runs the full semantic analysis pipeline for a single module document:
 * 1. Collects or reuses the module preamble (namespaces, prolog declarations, exports).
 * 2. Resolves module imports and collects exports from dependencies via the {@link ModuleProvider}.
 * 3. Builds the semantic AST and lexical scopes, resolving symbol references.
 * 4. Merges preamble, import, and semantic diagnostics into a unified {@link AnalysisResult}.
 */
export function analyzeModule(
    document: TextDocument,
    ast: ParserAstNode,
    options: AnalyzeModuleOptions,
): AnalyzeModuleResult {
    const preamble = options.preamble ?? collectModulePreamble(document.uri, ast);
    const index: ModuleIndex =
        preamble.targetNamespace === undefined
            ? { kind: "main", imports: preamble.imports }
            : {
                  kind: "library",
                  targetNamespace: preamble.targetNamespace,
                  imports: preamble.imports,
                  exports: preamble.exports,
              };

    const importResult = resolveImports(document.uri, index, options.provider);
    const analysis = analyzeDocument(document, ast, {
        resolvedImports: importResult.resolvedImports,
        preamble,
    });

    const unifiedResult: AnalysisResult = {
        ...analysis,
        diagnostics: [...importResult.diagnostics, ...analysis.diagnostics],
    };

    return {
        analysis: unifiedResult,
        dependencies: importResult.dependencies,
    };
}
