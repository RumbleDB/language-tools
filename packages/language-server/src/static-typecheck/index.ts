import {
    SourceDefinition,
    SourceFunctionDefinition,
    SourceParameterDefinition,
    SourceVariableDefinition,
} from "server/analysis/definitions.js";
import {
    type StaticFunctionType,
    type StaticSequenceType,
    type StaticType,
    type StaticTypecheckWireResult,
} from "server/static-typecheck/types.js";
import { DocumentUri, TextDocument } from "vscode-languageserver-textdocument";

import {
    buildStaticTypeKeyForDefinition,
    buildStaticTypeKeyForFunction,
    buildStaticTypeKeyForParameter,
    buildStaticTypeKeyForVariable,
    StaticTypeKey,
} from "./key.js";
import { getStaticTypecheck } from "./service.js";

export interface StaticTypeIndex {
    get(definition: SourceFunctionDefinition): StaticFunctionType | undefined;
    get(definition: SourceParameterDefinition): StaticSequenceType | undefined;
    get(definition: SourceVariableDefinition): StaticSequenceType | undefined;
    get(definition: SourceDefinition): StaticType | undefined;
}

function buildStaticTypeIndex(entries: StaticTypecheckWireResult["types"]): StaticTypeIndex {
    const result = new Map<StaticTypeKey, StaticType>();

    for (const entry of entries) {
        if (entry.kind === "function") {
            const { ["function"]: functionDefinition, position: functionPosition } = entry;
            const functionName = functionDefinition.name;
            const signature = functionDefinition.signature;
            const functionKey = buildStaticTypeKeyForFunction(functionPosition, functionName);

            result.set(functionKey, {
                function: {
                    name: functionName,
                    signature,
                },
            });

            for (const parameter of signature.parameterTypes) {
                if (parameter.name === undefined) {
                    continue;
                }

                const parameterKey = buildStaticTypeKeyForParameter(
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
                buildStaticTypeKeyForVariable(entry.variableKind, entry.position, entry.qname),
                {
                    sequenceType: entry.sequenceType,
                },
            );
        }
    }

    function get(definition: SourceFunctionDefinition): StaticFunctionType | undefined;
    function get(definition: SourceParameterDefinition): StaticSequenceType | undefined;
    function get(definition: SourceVariableDefinition): StaticSequenceType | undefined;
    function get(definition: SourceDefinition): StaticType | undefined {
        return result.get(buildStaticTypeKeyForDefinition(definition));
    }

    return { get };
}

const staticTypeIndexCache = new Map<
    DocumentUri,
    {
        index: StaticTypeIndex;
        version: number;
    }
>();

export function clearStaticTypeIndexCache(uri: DocumentUri): void {
    staticTypeIndexCache.delete(uri);
}

export async function getStaticTypeIndex(document: TextDocument): Promise<StaticTypeIndex> {
    let cache = staticTypeIndexCache.get(document.uri);

    if (cache === undefined || cache.version !== document.version) {
        const staticTypecheckResult = await getStaticTypecheck(document);
        cache = {
            index: buildStaticTypeIndex(staticTypecheckResult.body.types),
            version: document.version,
        };
        staticTypeIndexCache.set(document.uri, cache);
    }

    return cache.index;
}
