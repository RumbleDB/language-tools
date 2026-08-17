import type { AstParameter } from "server/parser/types/ast.js";
import type { Prefix } from "server/parser/types/name.js";
import type { Range } from "vscode-languageserver";

import type {
    SourceFunctionDefinition,
    SourceNamespaceDefinition,
    SourceParameterDefinition,
    SourceTypeDefinition,
    SourceVariableDefinition,
    SymbolId,
} from "../model/definitions.js";
import {
    functionNameToString,
    QNameToString,
    type FunctionName,
    type QName,
} from "../model/names.js";

/** Creates stable source-symbol identities independently in each analysis phase. */
export class SourceDefinitionFactory {
    private readonly occurrences = new Map<string, number>();

    public constructor(private readonly uri: string) {}

    public namespace(
        prefix: Prefix,
        namespaceUri: string,
        range: Range,
        selectionRange: Range,
    ): SourceNamespaceDefinition {
        return {
            ...this.base(range, selectionRange, `namespace:${prefix}`),
            kind: "namespace",
            name: { prefix },
            namespaceUri,
        };
    }

    public variable(name: QName, range: Range, selectionRange: Range): SourceVariableDefinition {
        return {
            ...this.base(range, selectionRange, `variable:${QNameToString(name, true)}`),
            kind: "variable",
            name,
        };
    }

    public type(name: QName, range: Range, selectionRange: Range): SourceTypeDefinition {
        return {
            ...this.base(range, selectionRange, `type:${QNameToString(name, true)}`),
            kind: "type",
            name,
        };
    }

    public function(
        name: FunctionName,
        range: Range,
        selectionRange: Range,
    ): SourceFunctionDefinition {
        return {
            ...this.base(range, selectionRange, `function:${functionNameToString(name, true)}`),
            kind: "function",
            name,
            parameters: [],
        };
    }

    public addParameter(
        parameter: AstParameter,
        name: QName,
        fn: SourceFunctionDefinition,
    ): SourceParameterDefinition {
        const definition: SourceParameterDefinition = {
            ...this.base(
                parameter.range,
                parameter.selectionRange,
                `${fn.id}:parameter:${parameter.index}`,
            ),
            kind: "parameter",
            name,
            function: fn,
        };
        (fn.parameters as SourceParameterDefinition[]).push(definition);
        return definition;
    }

    private base(range: Range, selectionRange: Range, symbolKey: string) {
        const occurrence = this.occurrences.get(symbolKey) ?? 0;
        this.occurrences.set(symbolKey, occurrence + 1);
        return {
            id: `${this.uri}#${encodeURIComponent(symbolKey)}:${occurrence}` as SymbolId,
            uri: this.uri,
            range,
            selectionRange,
            origin: "source" as const,
        };
    }
}
