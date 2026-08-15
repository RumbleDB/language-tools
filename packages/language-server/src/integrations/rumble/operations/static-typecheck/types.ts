import type { Range } from "vscode-languageserver";

export interface StaticTypecheckError {
    code: string;
    message: string;
    location: string;
    range: Range;
}

export interface StaticTypecheckWireResult {
    errors: StaticTypecheckError[];
}
