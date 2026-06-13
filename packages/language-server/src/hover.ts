import { MarkupKind, type Hover, type Position } from "vscode-languageserver";
import { TextDocument } from "vscode-languageserver-textdocument";

import {
    Definition,
    definitionNameToString,
    isSourceDefinition,
    SourceDefinition,
} from "./analysis/definitions.js";
import { findSymbolAtPosition } from "./analysis/queries.js";
import { getAnalysis } from "./analysis/service.js";
import { formatFunctionDocEntry, getBuiltinFunctionDocumentation } from "./assets/function-docs.js";
import { formatStaticType } from "./static-typecheck/format.js";
import { getStaticTypeIndex, StaticTypeIndex } from "./static-typecheck/index.js";

export async function findHover(document: TextDocument, position: Position): Promise<Hover | null> {
    const analysis = getAnalysis(document);
    const occurrence = findSymbolAtPosition(analysis, position);

    if (occurrence === undefined || occurrence.declaration === undefined) {
        return null;
    }

    const staticTypes = await getStaticTypeIndex(document);
    const declaration = occurrence.declaration;

    return {
        range: occurrence.range,
        contents: {
            kind: MarkupKind.Markdown,
            value: createHoverContent(staticTypes, declaration),
        },
    };
}

function createHoverContent(staticTypes: StaticTypeIndex, declaration: Definition): string {
    if (declaration.kind === "builtin-function") {
        const doc = getBuiltinFunctionDocumentation(declaration.name.qname);
        if (doc) {
            return formatFunctionDocEntry(doc, declaration.name.arity);
        }
    }

    const name = definitionNameToString(declaration);

    return [
        "```jsoniq",
        name,
        "```",
        `kind: \`${declaration.kind}\``,
        isSourceDefinition(declaration)
            ? `defined at: \`${declaration.selectionRange.start.line + 1}:${declaration.selectionRange.start.character}\``
            : undefined,
        isSourceDefinition(declaration)
            ? `inferred type: \`${formatOptionalStaticType(staticTypes, declaration)}\``
            : undefined,
    ].join("\n");
}

function formatOptionalStaticType(
    staticTypes: StaticTypeIndex,
    declaration: SourceDefinition,
): string {
    const staticType = staticTypes.get(declaration);

    return staticType === undefined ? "unknown" : formatStaticType(staticType);
}
