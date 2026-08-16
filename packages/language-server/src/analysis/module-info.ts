import type { Prefix } from "server/parser/types/name.js";
import type { Range } from "vscode-languageserver";

import type { SourceModuleExportDefinition } from "./definitions.js";

export interface ModuleImport {
    readonly prefix?: Prefix;
    readonly prefixRange?: Range;
    readonly namespaceUri: string;
    readonly namespaceUriRange: Range;
    readonly locations: readonly { uri: string; range: Range }[];
    readonly range: Range;
}

interface BaseModuleIndex {
    readonly imports: readonly ModuleImport[];
}

export interface MainModuleIndex extends BaseModuleIndex {
    readonly kind: "main";
}

export interface LibraryModuleIndex extends BaseModuleIndex {
    readonly kind: "library";
    readonly targetNamespace: string;
    readonly exports: ReadonlyMap<string, SourceModuleExportDefinition>;
}

export type ModuleIndex = MainModuleIndex | LibraryModuleIndex;
