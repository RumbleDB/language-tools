import type { Prefix } from "server/parser/types/name.js";
import type { Diagnostic } from "vscode-languageserver";

import type { ModuleProlog } from "../resolution/module-prolog.js";
import type { ModuleNode } from "./ast.js";
import type {
    BuiltinDefinitionByReferenceKind,
    SchemaConstructorDefinition,
    SchemaTypeDefinition,
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

    /** Effective prefix bindings, including defaults overridden by module declarations. */
    readonly namespaces: ReadonlyMap<Prefix, string>;

    /** Explicit default for unprefixed element/type names; an empty string means no namespace. */
    readonly defaultElementTypeNamespace: string | undefined;

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
    /** Schema constructors visible in this module only; these are not library-module exports. */
    readonly schemaConstructors?: readonly SchemaConstructorDefinition[];
    /** Named XML Schema types visible in this module only; these are not library-module exports. */
    readonly schemaTypes?: readonly SchemaTypeDefinition[];
    readonly resolvedImports?: readonly ResolvedModuleImport[];
    readonly prolog?: ModuleProlog;
    /** Resolves a name to its builtin definition, if one exists. */
    readonly resolveBuiltin?: BuiltinResolver;
}
