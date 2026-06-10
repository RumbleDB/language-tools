import {
    SourceDefinition,
    SourceFunctionDefinition,
    SourceParameterDefinition,
    SourceVariableDefinition,
} from "server/analysis/definitions.js";
import { toResolvedQName } from "server/wrapper/names.js";
import { getTypeInference } from "server/wrapper/type-inference.js";
import {
    type InferredFunctionType,
    type InferredSequenceType,
    type InferredType,
    type TypeInferenceResult,
} from "server/wrapper/types.js";
import { DocumentUri, TextDocument } from "vscode-languageserver-textdocument";

import {
    buildInferenceKeyForDefinition,
    buildInferenceKeyForFunction,
    buildInferenceKeyForParameter,
    buildInferenceKeyForVariable,
    InferenceKey,
} from "./key.js";

export interface TypeInferenceIndex {
    get(definition: SourceFunctionDefinition): InferredFunctionType | undefined;
    get(definition: SourceParameterDefinition): InferredSequenceType | undefined;
    get(definition: SourceVariableDefinition): InferredSequenceType | undefined;
    get(definition: SourceDefinition): InferredType | undefined;
}

export const EMPTY_TYPE_INFERENCE_INDEX: TypeInferenceIndex = {
    get: () => undefined,
};

function buildTypeInferenceIndex(entries: TypeInferenceResult["types"]): TypeInferenceIndex {
    const result = new Map<InferenceKey, InferredType>();

    for (const entry of entries) {
        if (entry.kind === "function") {
            const { ["function"]: functionDefinition, position: functionPosition } = entry;
            const functionName = functionDefinition.name;
            const functionKey = buildInferenceKeyForFunction(functionPosition, functionName);

            result.set(functionKey, entry);

            for (const parameter of functionDefinition.signature.parameterTypes) {
                if (parameter.name === null) {
                    continue;
                }

                const parameterKey = buildInferenceKeyForParameter(
                    functionPosition,
                    functionName,
                    parameter.name.qname,
                );
                result.set(parameterKey, {
                    sequenceType: parameter.type,
                });
            }
        } else {
            result.set(
                buildInferenceKeyForVariable(
                    entry.variableKind,
                    entry.position,
                    toResolvedQName(entry.qname),
                ),
                {
                    sequenceType: entry.sequenceType,
                },
            );
        }
    }

    function get(definition: SourceFunctionDefinition): InferredFunctionType | undefined;
    function get(definition: SourceParameterDefinition): InferredSequenceType | undefined;
    function get(definition: SourceVariableDefinition): InferredSequenceType | undefined;
    function get(definition: SourceDefinition): InferredType | undefined {
        return result.get(buildInferenceKeyForDefinition(definition));
    }

    return { get };
}

const typeInferenceIndexCache = new Map<
    DocumentUri,
    {
        index: TypeInferenceIndex;
        version: number;
    }
>();

export async function getTypeInferenceIndex(document: TextDocument): Promise<TypeInferenceIndex> {
    let cache = typeInferenceIndexCache.get(document.uri);

    if (cache === undefined || cache.version !== document.version) {
        const typeInferenceResult = await getTypeInference(document);
        cache = {
            index: buildTypeInferenceIndex(typeInferenceResult.body.types),
            version: document.version,
        };
        typeInferenceIndexCache.set(document.uri, cache);
    }

    return cache.index;
}
