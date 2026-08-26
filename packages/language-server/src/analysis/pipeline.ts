import type { AstNode as ParserAstNode } from "server/parser/types/ast.js";
import type { DocumentUri } from "vscode-languageserver";
import type { TextDocument } from "vscode-languageserver-textdocument";

import { analyzeDocument } from "./builder.js";
import type { AnalysisEnvironment, AnalysisResult } from "./model/result.js";
import { resolveImports, type ModuleProvider } from "./resolution/import-resolution.js";
import { collectModuleProlog, type ModuleProlog } from "./resolution/module-prolog.js";

export interface AnalyzeModuleOptions {
    readonly provider: ModuleProvider;
    readonly prolog?: ModuleProlog;
    readonly resolveBuiltin?: AnalysisEnvironment["resolveBuiltin"];
}

export interface AnalyzeModuleResult {
    readonly analysis: AnalysisResult;
    readonly dependencies: ReadonlySet<DocumentUri>;
}

/**
 * Runs the full semantic analysis pipeline for a single module document:
 * 1. Collects or reuses the module prolog (namespaces, prolog declarations, exports).
 * 2. Resolves module imports and collects exports from dependencies via the {@link ModuleProvider}.
 * 3. Builds the semantic AST and lexical scopes, resolving symbol references.
 * 4. Merges prolog, import, and semantic diagnostics into a unified {@link AnalysisResult}.
 */
export function analyzeModule(
    document: TextDocument,
    ast: ParserAstNode,
    options: AnalyzeModuleOptions,
): AnalyzeModuleResult {
    const prolog = options.prolog ?? collectModuleProlog(document.uri, ast);
    const importResult = resolveImports(document.uri, prolog, options.provider);
    const analysis = analyzeDocument(document, ast, {
        resolvedImports: importResult.resolvedImports,
        prolog,
        ...(options.resolveBuiltin !== undefined && { resolveBuiltin: options.resolveBuiltin }),
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
