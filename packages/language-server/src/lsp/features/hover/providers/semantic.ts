import {
    findSymbolAtPosition,
    formatSequenceType,
    formatSequenceTypeExpanded,
    parameterListToString,
    type BuiltinFunctionDefinition,
    type Definition,
    type SchemaConstructorDefinition,
} from "server/analysis/index.js";
import { getTypeAtPosition } from "server/integrations/rumble/operations/type-at-position/service.js";
import {
    formatFunctionDocEntry,
    getBuiltinFunctionDocumentation,
} from "server/resources/function-docs.js";
import { describeArrowOperand, findArrowCallByName } from "server/utils/function-calls.js";
import { sameRange } from "server/utils/range.js";
import { MarkupKind } from "vscode-languageserver";

import type { HoverProvider } from "../types.js";

export const provideSemanticHover: HoverProvider = async (context) => {
    const analysis = await context.getAnalysis();
    const occurrence = findSymbolAtPosition(analysis, context.position);
    const arrowCall = findArrowCallByName(analysis, context.position);
    const arrowNote = arrowCall === undefined ? "" : `\n\n${describeArrowOperand(arrowCall)}`;

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
                value:
                    createFunctionHoverContent(
                        declaration,
                        context.document.getText(occurrence.range),
                    ) + arrowNote,
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

    // A variable or function name reads like its declaration, `$x as xs:integer`. Any other expression is already
    // highlighted in the editor, and repeating its source text would only crowd the hover.
    const isName = occurrence !== undefined && sameRange(occurrence.range, range);
    const prefix = isName
        ? `${declarationName(declaration, context.document.getText(range))} as `
        : "";
    return {
        range,
        contents: {
            kind: MarkupKind.Markdown,
            value:
                codeBlock(formatSequenceTypeExpanded(sequenceType, prefix)) +
                (isName ? arrowNote : ""),
        },
    };
};

/** The name of a declaration as it is declared: a function's return type follows its parameters. */
function declarationName(declaration: Definition | undefined, name: string): string {
    if (declaration?.kind === "function" && declaration.origin === "source") {
        return `${name}${parameterListToString(declaration)}`;
    }
    return name;
}

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
