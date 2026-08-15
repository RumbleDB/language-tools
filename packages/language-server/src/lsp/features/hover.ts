import { Definition, definitionNameToString } from "server/analysis/definitions.js";
import { findSymbolAtPosition } from "server/analysis/queries.js";
import {
    formatFunctionDocEntry,
    getBuiltinFunctionDocumentation,
} from "server/assets/function-docs.js";
import { getTypeAtPosition } from "server/integrations/rumble/operations/type-at-position/service.js";
import { formatSequenceType, type SequenceType } from "server/static-typecheck/types.js";
import { getAnalysis } from "server/workspace/service.js";
import { MarkupKind, type Hover, type Position } from "vscode-languageserver";
import { TextDocument } from "vscode-languageserver-textdocument";

import type { FeatureRegistrationContext } from "./context.js";

export function registerHover({ connection, documents }: FeatureRegistrationContext): void {
    connection.onHover((params) => {
        const document = documents.get(params.textDocument.uri);
        return document === undefined ? null : findHover(document, params.position);
    });
}

export async function findHover(document: TextDocument, position: Position): Promise<Hover | null> {
    const occurrence = findSymbolAtPosition(getAnalysis(document), position);
    const type = await getTypeAtPosition(document, position);

    const range = occurrence?.range ?? type?.range;
    if (!range) {
        return null;
    }

    const value = createHoverContent({
        declaration: occurrence?.declaration,
        codeSnippet: document.getText(range),
        inferredType: type.sequenceType,
    });

    return {
        range,
        contents: {
            kind: MarkupKind.Markdown,
            value,
        },
    };
}

interface HoverContentOptions {
    declaration?: Definition | undefined;
    codeSnippet?: string | undefined;
    inferredType?: SequenceType | undefined;
}

function createHoverContent(options: HoverContentOptions): string {
    const { declaration, codeSnippet, inferredType } = options;

    if (declaration?.origin === "builtin" && declaration.kind === "function") {
        const doc = getBuiltinFunctionDocumentation(declaration.name.qname);
        if (doc) {
            return formatFunctionDocEntry(doc, declaration.name.arity);
        }
    }

    const code = declaration ? definitionNameToString(declaration) : codeSnippet;
    const typeStr = inferredType ? formatSequenceType(inferredType) : undefined;

    return ["```jsoniq", code + (typeStr ? ` as ${typeStr}` : ""), "```"]
        .filter(Boolean)
        .join("\n");
}
