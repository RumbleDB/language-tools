import type { Diagnostic } from "vscode-languageserver";

import type { ModuleProlog } from "../resolution/module-prolog.js";
import type { ModuleNode } from "./ast.js";
import type {
    BuiltinDefinitionByReferenceKind,
    SourceModuleExportDefinition,
} from "./definitions.js";
import type { ReferenceNameByKind } from "./names.js";
import type { Scope } from "./scope.js";

export type BuiltinResolver = <K extends keyof ReferenceNameByKind>(
    kind: K,
    name: ReferenceNameByKind[K],
) => BuiltinDefinitionByReferenceKind[K] | undefined;

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
    readonly prolog?: ModuleProlog;
    /** Resolves a name to its builtin definition, if one exists. */
    readonly resolveBuiltin?: BuiltinResolver;
}
