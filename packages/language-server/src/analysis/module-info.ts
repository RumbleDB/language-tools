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

interface BaseModuleInfo {
    readonly imports: readonly ModuleImport[];
}

export interface MainModuleInfo extends BaseModuleInfo {
    readonly kind: "main";
}

export interface LibraryModuleInfo extends BaseModuleInfo {
    readonly kind: "library";
    readonly namespace: SourceNamespaceDefinition;
    readonly exports: readonly SourceModuleExportDefinition[];
}

export type ModuleInfo = MainModuleInfo | LibraryModuleInfo;
