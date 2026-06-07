import { SourceDefinition } from "server/analysis/model.js";
import {
    expandedQNameToString,
    type ResolvedFunctionName,
    type ResolvedVarName,
} from "server/analysis/names.js";

const INFERENCE_KEY_SEPARATOR = "\u001F";

export type InferenceKey = string;

export function buildInferenceKey(
    kind: string,
    position: { line: number; character: number },
    ...names: string[]
): InferenceKey {
    return [kind, position.line, position.character, ...names].join(INFERENCE_KEY_SEPARATOR);
}

function formatVariableName(name: ResolvedVarName): string {
    return `$${expandedQNameToString(name.qname)}`;
}

function formatFunctionName(name: ResolvedFunctionName): string {
    return `${expandedQNameToString(name.qname)}#${name.arity ?? "?"}`;
}

export function buildInferenceKeyForFunction(
    position: { line: number; character: number },
    name: ResolvedFunctionName,
): InferenceKey {
    return buildInferenceKey("function", position, formatFunctionName(name));
}

export function buildInferenceKeyForParameter(
    position: { line: number; character: number },
    functionName: ResolvedFunctionName,
    parameterName: ResolvedVarName,
): InferenceKey {
    return buildInferenceKey(
        "parameter",
        position,
        formatFunctionName(functionName),
        formatVariableName(parameterName),
    );
}

export function buildInferenceKeyForVariable(
    kind: string,
    position: { line: number; character: number },
    name: ResolvedVarName,
): InferenceKey {
    return buildInferenceKey(kind, position, formatVariableName(name));
}

export function buildInferenceKeyForDefinition(definition: SourceDefinition): InferenceKey {
    switch (definition.kind) {
        case "function":
            return buildInferenceKeyForFunction(definition.range.start, definition.name);
        case "parameter":
            return buildInferenceKeyForParameter(
                definition.function.range.start,
                definition.function.name,
                definition.name,
            );
        case "declare-variable":
        case "let":
        case "for":
        case "for-position":
        case "group-by":
        case "count":
        case "catch-variable":
            return buildInferenceKeyForVariable(
                definition.kind,
                definition.range.start,
                definition.name,
            );
        case "namespace":
        case "type":
            return buildInferenceKey(definition.kind, definition.range.start);
        default:
            throw definition satisfies never;
    }
}
