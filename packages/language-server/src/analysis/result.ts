import type { Diagnostic } from "vscode-languageserver";

import type { ModuleNode } from "./ast.js";
import type { SourceModuleExportDefinition } from "./definitions.js";
import type { Scope } from "./scope.js";

export interface AnalysisResult {
    /**
     * Root AST node for the module
     */
    readonly ast: ModuleNode;

    /**
     * Root scope of the module
     */
    readonly scope: Scope;

    /**
     * List of all diagnostics reported during analysis of the module
     */
    readonly diagnostics: readonly Diagnostic[];
}

/** Declarations made visible by a directly imported library module. */
export interface ResolvedModuleImport {
    readonly targetNamespaceUri: string;
    readonly exports: ReadonlyMap<string, SourceModuleExportDefinition>;
}

export interface AnalysisEnvironment {
    readonly resolvedImports?: readonly ResolvedModuleImport[];
}
