import { Definition, definitionNameToString } from "server/analysis/definitions.js";
import { findSymbolAtPosition } from "server/analysis/queries.js";
import { formatSequenceType, type SequenceType } from "server/analysis/type-system.js";
import { getTypeAtPosition } from "server/integrations/rumble/operations/type-at-position/service.js";
import {
    formatFunctionDocEntry,
    getBuiltinFunctionDocumentation,
} from "server/resources/function-docs.js";
import { MarkupKind } from "vscode-languageserver";

import type { HoverProvider } from "../types.js";

export const provideSemanticHover: HoverProvider = async (context) => {
    const occurrence = findSymbolAtPosition(context.getAnalysis(), context.position);
    const type = await getTypeAtPosition(context.document, context.position);

    const range = occurrence?.range ?? type?.range;
    if (range === undefined) {
        return null;
    }

    return {
        range,
        contents: {
            kind: MarkupKind.Markdown,
            value: createHoverContent({
                declaration: occurrence?.declaration,
                codeSnippet: context.document.getText(range),
                inferredType: type.sequenceType,
            }),
        },
    };
};

interface HoverContentOptions {
    declaration?: Definition | undefined;
    codeSnippet?: string | undefined;
    inferredType?: SequenceType | undefined;
}

function createHoverContent(options: HoverContentOptions): string {
    const { declaration, codeSnippet, inferredType } = options;

    if (declaration?.origin === "builtin" && declaration.kind === "function") {
        const doc = getBuiltinFunctionDocumentation(declaration.name.qname);
        if (doc !== undefined) {
            return formatFunctionDocEntry(doc, declaration.name.arity);
        }
    }

    const code = declaration ? definitionNameToString(declaration) : codeSnippet;
    const typeStr = inferredType ? formatSequenceType(inferredType) : undefined;

    return ["```jsoniq", code + (typeStr ? ` as ${typeStr}` : ""), "```"]
        .filter(Boolean)
        .join("\n");
}
