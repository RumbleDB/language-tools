import type { Prefix } from "server/parser/types/name.js";
import type { Range } from "vscode-languageserver";

import type { SourceModuleExportDefinition, SourceNamespaceDefinition } from "./definitions.js";

export interface ModuleImport {
    readonly prefix?: Prefix;
    readonly prefixRange?: Range;
    readonly namespaceUri: string;
    readonly namespaceUriRange: Range;
    readonly locations: readonly { uri: string; range: Range }[];
    readonly range: Range;
}

interface BaseModuleDeclaration {
    readonly imports: ModuleImport[];
}

export interface MainModuleDeclaration extends BaseModuleDeclaration {
    readonly kind: "main";
}

export interface LibraryModuleDeclaration extends BaseModuleDeclaration {
    readonly kind: "library";
    readonly targetNamespace: SourceNamespaceDefinition;
}

export type ModuleDeclaration = MainModuleDeclaration | LibraryModuleDeclaration;

export interface ModuleInterface {
    readonly namespaceUri: string;
    readonly exports: SourceModuleExportDefinition[];
}
