import type { Prefix } from "server/parser/types/name.js";
import type { Diagnostic } from "vscode-languageserver";

import type { ModuleNode } from "./ast.js";
import type {
    Definition,
    NamespaceDefinition,
    SourceDefinition,
    SourceModuleExportDefinition,
} from "./definitions.js";
import type { ModuleDeclaration, ModuleInterface } from "./module-info.js";
import type { AnyResolvedReference } from "./reference.js";
import type { Scope } from "./scope.js";

export interface AnalysisResult {
    /**
     * Root AST node for the module
     */
    ast: ModuleNode;

    /**
     * Module declaration of current module, either main or library
     */
    readonly moduleDeclaration: ModuleDeclaration;

    /**
     * Module interface of current module, if it is a library module
     */
    readonly moduleInterface?: ModuleInterface;

    /**
     * Root scope of the module
     */
    readonly scope: Scope;

    /**
     * Map of namespace prefix to namespace definition for all namespaces declared in the module
     */
    readonly namespaces: ReadonlyMap<Prefix, NamespaceDefinition>;

    /**
     * List of all definitions declared in the module
     */
    readonly definitions: readonly SourceDefinition[];

    /**
     * List of all resolved references in the module
     */
    readonly references: AnyResolvedReference[];

    /**
     * Map from definition to all resolved references to that definition in the module
     */
    readonly referencesByDefinition: Map<Definition, AnyResolvedReference[]>;

    /**
     * List of all diagnostics reported during analysis of the module
     */
    readonly diagnostics: Diagnostic[];
}

/** Declarations made visible by a directly imported library module. */
export interface ResolvedModuleImport {
    readonly targetNamespaceUri: string;
    readonly exports: ReadonlyMap<string, SourceModuleExportDefinition>;
}

export interface AnalysisEnvironment {
    readonly resolvedImports?: readonly ResolvedModuleImport[];
    readonly diagnostics?: readonly Diagnostic[];
}
