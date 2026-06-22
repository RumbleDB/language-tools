import type { Position } from "vscode-languageserver";

import { QNameToString, type FunctionName, type QName } from "../analysis/names.js";

export interface TypeDefinition {
    name?: QName;
}

export interface SequenceType {
    itemType: TypeDefinition;
    arity: string;
}

export interface StaticFunctionParameter {
    name?: FunctionName;
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

export interface StaticTypecheckWireError {
    code: string;
    message: string;
    location: string;
    position: Position;
}

export interface StaticVariableTypeEntry {
    kind: "variable";
    variableKind: StaticVariableKind;
    position: Position;
    qname: QName;
    sequenceType: SequenceType;
}

export interface StaticFunctionTypeEntry {
    kind: "function";
    position: Position;
    function: StaticFunctionDefinition;
}

export type StaticTypeEntry = StaticVariableTypeEntry | StaticFunctionTypeEntry;

export interface StaticTypecheckWireResult {
    types: StaticTypeEntry[];
    errors: StaticTypecheckWireError[];
}

export function formatTypeDefinition(type: TypeDefinition): string {
    return type.name === undefined ? "anonymous type" : QNameToString(type.name, false);
}

export function formatSequenceType(type: SequenceType): string {
    return `${formatTypeDefinition(type.itemType)}${type.arity}`;
}
