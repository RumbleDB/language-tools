import type { Range } from "vscode-languageserver";

export interface StaticTypecheckError {
    code: string;
    message: string;
    location: string;
    range: Range;
    /** Whether every value fails the check. Otherwise only some do, as for an item* argument of type xs:integer. */
    certain: boolean;
}

export interface StaticTypecheckWireResult {
    errors: StaticTypecheckError[];
}
