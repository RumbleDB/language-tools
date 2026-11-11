import type { Range } from "vscode-languageserver";

export interface StaticTypecheckError {
    code: string;
    message: string;
    location: string;
    range: Range;
    /** Whether every value fails the check, rather than only some, as an item* argument for an xs:integer. */
    certain: boolean;
}

export interface StaticTypecheckWireResult {
    errors: StaticTypecheckError[];
}
