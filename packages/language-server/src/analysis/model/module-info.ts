import type { Prefix } from "server/parser/types/name.js";
import type { Range } from "vscode-languageserver";

export interface ModuleImport {
    readonly prefix?: Prefix;
    readonly prefixRange?: Range;
    readonly namespaceUri: string;
    readonly namespaceUriRange: Range;
    readonly locations: readonly { uri: string; range: Range }[];
    readonly range: Range;
}
