import type { Position } from "vscode-languageserver";

import type { FunctionName } from "../analysis/names.js";
import type { WrapperResolvedQName } from "../wrapper/names.js";

export type SequenceType = string;

export interface StaticFunctionParameter {
    name: FunctionName | null;
    type: SequenceType;
}

export interface StaticFunctionSignature {
    parameterTypes: StaticFunctionParameter[];
    returnType: SequenceType;
}

export interface StaticFunctionDefinition {
    name: FunctionName;
    signature: StaticFunctionSignature;
}

export type StaticVariableKind =
    | "declare-variable"
    | "let"
    | "for"
    | "for-position"
    | "group-by"
    | "count";

export interface StaticSequenceType {
    sequenceType: SequenceType;
}

export interface StaticFunctionType {
    function: StaticFunctionDefinition;
}

export type StaticType = StaticSequenceType | StaticFunctionType;

export interface StaticVariableTypeEntry extends StaticSequenceType {
    kind: "variable";
    variableKind: StaticVariableKind;
    position: Position;
    qname: WrapperResolvedQName;
}

export interface StaticFunctionTypeEntry extends StaticFunctionType {
    kind: "function";
    position: Position;
}

export type StaticTypeEntry = StaticVariableTypeEntry | StaticFunctionTypeEntry;

export interface StaticTypecheckWireError {
    code: string;
    message: string;
    location: string;
    position: Position;
}

export interface StaticTypecheckWireResult {
    types: StaticTypeEntry[];
    errors: StaticTypecheckWireError[];
}
