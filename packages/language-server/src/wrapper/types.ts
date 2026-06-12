import type { Position } from "vscode-languageserver";

import type { FunctionName } from "../analysis/names.js";
import type { WrapperResolvedQName } from "./names.js";

export type SequenceType = string;

export interface WrapperFunctionParameter {
    name: FunctionName | null;
    type: SequenceType;
}

export interface WrapperFunctionSignature {
    parameterTypes: WrapperFunctionParameter[];
    returnType: SequenceType;
}

export interface WrapperFunctionDefinition {
    name: FunctionName;
    signature: WrapperFunctionSignature;
}

export interface BuiltinFunctionsResponseBody {
    builtinFunctions: WrapperFunctionDefinition[];
}

export type WrapperVariableKind =
    | "declare-variable"
    | "let"
    | "for"
    | "for-position"
    | "group-by"
    | "count";

export interface InferredSequenceType {
    sequenceType: SequenceType;
}

export interface InferredFunctionType {
    function: WrapperFunctionDefinition;
}

export type InferredType = InferredSequenceType | InferredFunctionType;

export interface InferredVariableTypeEntry extends InferredSequenceType {
    kind: "variable";
    variableKind: WrapperVariableKind;
    position: Position;
    qname: WrapperResolvedQName;
}

export interface InferredFunctionTypeEntry extends InferredFunctionType {
    kind: "function";
    position: Position;
}

export type InferredTypeEntry = InferredVariableTypeEntry | InferredFunctionTypeEntry;

export interface WrapperTypeError {
    code: string;
    message: string;
    location: string;
    position: Position;
}

export interface TypeInferenceResult {
    types: InferredTypeEntry[];
    errors: WrapperTypeError[];
}
