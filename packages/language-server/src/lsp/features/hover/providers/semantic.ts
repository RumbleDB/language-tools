import {
    findSymbolAtPosition,
    formatSequenceType,
    type BuiltinFunctionDefinition,
    type SchemaConstructorDefinition,
} from "server/analysis/index.js";
import { getTypeAtPosition } from "server/integrations/rumble/operations/type-at-position/service.js";
import {
    formatFunctionDocEntry,
    getBuiltinFunctionDocumentation,
} from "server/resources/function-docs.js";
import { MarkupKind } from "vscode-languageserver";

import type { HoverProvider } from "../types.js";

export const provideSemanticHover: HoverProvider = async (context) => {
    const occurrence = findSymbolAtPosition(await context.getAnalysis(), context.position);

    const declaration = occurrence?.declaration;
    if (declaration?.kind === "type" || declaration?.kind === "namespace") {
        // No symbol documentation yet;
        return null;
    }

    if (
        occurrence !== undefined &&
        declaration?.kind === "function" &&
        declaration.origin !== "source"
    ) {
        return {
            range: occurrence.range,
            contents: {
                kind: MarkupKind.Markdown,
                value: createFunctionHoverContent(
                    declaration,
                    context.document.getText(occurrence.range),
                ),
            },
        };
    }

    const { range, sequenceType } = await getTypeAtPosition(
        context.document,
        context.position,
        context.wrapper,
    );
    if (range === undefined || sequenceType === undefined) {
        return null;
    }

    return {
        range,
        contents: {
            kind: MarkupKind.Markdown,
            value: codeBlock(
                `${context.document.getText(range)} as ${formatSequenceType(sequenceType)}`,
            ),
        },
    };
};

function createFunctionHoverContent(
    declaration: BuiltinFunctionDefinition | SchemaConstructorDefinition,
    name: string,
): string {
    const doc =
        declaration.origin === "builtin"
            ? getBuiltinFunctionDocumentation(declaration.name.qname)
            : undefined;
    if (doc !== undefined) {
        return formatFunctionDocEntry(doc, declaration.name.arity);
    }

    const parameters = declaration.signature.parameterTypes
        .map((parameter) => formatSequenceType(parameter.type))
        .join(", ");

    return codeBlock(
        `${name}(${parameters}) as ${formatSequenceType(declaration.signature.returnType)}`,
    );
}

function codeBlock(code: string): string {
    return `\`\`\`jsoniq\n${code}\n\`\`\``;
}
