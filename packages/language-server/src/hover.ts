import { getBuiltinFunctionDocumentation } from "server/function-doc/index.js";
import { MarkupKind, type Hover, type Position } from "vscode-languageserver";
import { TextDocument } from "vscode-languageserver-textdocument";

import {
    definitionNameToString,
    isSourceDefinition,
    type Definition,
    type SourceDefinition,
} from "./analysis/model.js";
import { findSymbolAtPosition } from "./analysis/queries.js";
import { getAnalysis } from "./analysis/service.js";
import { formatInferredType } from "./type-inference/format.js";
import { getTypeInferenceIndex, TypeInferenceIndex } from "./type-inference/service.js";

export async function findHover(document: TextDocument, position: Position): Promise<Hover | null> {
    const analysis = await getAnalysis(document);
    const occurrence = findSymbolAtPosition(analysis, position);

    if (occurrence === undefined || occurrence.declaration === undefined) {
        return null;
    }

    const typeInference = await getTypeInferenceIndex(document);
    const declaration = occurrence.declaration;

    return {
        range: occurrence.range,
        contents: {
            kind: MarkupKind.Markdown,
            value: createHoverContent(typeInference, declaration),
        },
    };
}

function createHoverContent(typeInference: TypeInferenceIndex, declaration: Definition): string {
    if (declaration.kind === "builtin-function") {
        const doc = getBuiltinFunctionDocumentation(declaration.name.qname, declaration.name.arity);
        if (doc) {
            return doc;
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
            ? `inferred type: \`${formatOptionalInferredType(typeInference, declaration)}\``
            : undefined,
    ].join("\n");
}

function formatOptionalInferredType(
    typeInference: TypeInferenceIndex,
    declaration: SourceDefinition,
): string {
    const inferredType = typeInference.get(declaration);

    return inferredType === undefined ? "unknown" : formatInferredType(inferredType);
}
