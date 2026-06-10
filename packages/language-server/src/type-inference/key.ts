import { SourceDefinition } from "server/analysis/definitions.js";
import { FunctionName, functionNameToString, QName, QNameToString } from "server/analysis/names.js";

const INFERENCE_KEY_SEPARATOR = "\u001F";

export type InferenceKey = string;

export function buildInferenceKey(
    kind: string,
    position: { line: number; character: number },
    ...names: string[]
): InferenceKey {
    return [kind, position.line, position.character, ...names].join(INFERENCE_KEY_SEPARATOR);
}

export function buildInferenceKeyForFunction(
    position: { line: number; character: number },
    name: FunctionName,
): InferenceKey {
    return buildInferenceKey("function", position, functionNameToString(name, true));
}

export function buildInferenceKeyForParameter(
    position: { line: number; character: number },
    functionName: FunctionName,
    parameterName: QName,
): InferenceKey {
    return buildInferenceKey(
        "parameter",
        position,
        functionNameToString(functionName, true),
        QNameToString(parameterName, true),
    );
}

export function buildInferenceKeyForVariable(
    kind: string,
    position: { line: number; character: number },
    name: QName,
): InferenceKey {
    return buildInferenceKey(kind, position, QNameToString(name, true));
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
