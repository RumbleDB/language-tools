import type { SequenceType } from "server/analysis/index.js";
import type { Range } from "vscode-languageserver";

export interface StaticTypecheckError {
    code: string;
    message: string;
    location: string;
    range: Range;
    /** Whether every value fails the check, rather than only some, as an item* argument for an xs:integer. */
    certain: boolean;
}

/** A variable, by the range of its name where it is bound, including the `$`, and its inferred type. */
export interface VariableBinding {
    range: Range;
    sequenceType: SequenceType;
}

export interface StaticTypecheckWireResult {
    errors: StaticTypecheckError[];
    /** The variables that the query binds, typed even when it has errors, as far as its valid parts allow. */
    bindings: VariableBinding[];
}
