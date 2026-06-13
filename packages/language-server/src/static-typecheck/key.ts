import { SourceDefinition } from "server/analysis/definitions.js";
import { FunctionName, functionNameToString, QName, QNameToString } from "server/analysis/names.js";

const STATIC_TYPE_KEY_SEPARATOR = "\u001F";

export type StaticTypeKey = string;

export function buildStaticTypeKey(
    kind: string,
    position: { line: number; character: number },
    ...names: string[]
): StaticTypeKey {
    return [kind, position.line, position.character, ...names].join(STATIC_TYPE_KEY_SEPARATOR);
}

export function buildStaticTypeKeyForFunction(
    position: { line: number; character: number },
    name: FunctionName,
): StaticTypeKey {
    return buildStaticTypeKey("function", position, functionNameToString(name, true));
}

export function buildStaticTypeKeyForParameter(
    position: { line: number; character: number },
    functionName: FunctionName,
    parameterName: QName,
): StaticTypeKey {
    return buildStaticTypeKey(
        "parameter",
        position,
        functionNameToString(functionName, true),
        QNameToString(parameterName, true),
    );
}

export function buildStaticTypeKeyForVariable(
    kind: string,
    position: { line: number; character: number },
    name: QName,
): StaticTypeKey {
    return buildStaticTypeKey(kind, position, QNameToString(name, true));
}

export function buildStaticTypeKeyForDefinition(definition: SourceDefinition): StaticTypeKey {
    switch (definition.kind) {
        case "function":
            return buildStaticTypeKeyForFunction(definition.range.start, definition.name);
        case "parameter":
            return buildStaticTypeKeyForParameter(
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
            return buildStaticTypeKeyForVariable(
                definition.kind,
                definition.range.start,
                definition.name,
            );
        case "namespace":
        case "type":
            return buildStaticTypeKey(definition.kind, definition.range.start);
        default:
            throw definition satisfies never;
    }
}
