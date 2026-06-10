import { getBuiltinFunctionHover } from "server/function-catalog/index.js";
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
    if (isSourceDefinition(declaration)) {
        const name = definitionNameToString(declaration);
        const declarationLine = declaration.selectionRange.start.line + 1;

        return [
            "```jsoniq",
            name,
            "```",
            `kind: \`${declaration.kind}\``,
            `declared at line ${declarationLine}`,
            `inferred type: \`${formatOptionalInferredType(typeInference, declaration)}\``,
        ].join("\n");
    } else {
        return getBuiltinFunctionHover(declaration);
    }
}

function formatOptionalInferredType(
    typeInference: TypeInferenceIndex,
    declaration: SourceDefinition,
): string {
    const inferredType = typeInference.get(declaration);

    return inferredType === undefined ? "unknown" : formatInferredType(inferredType);
}
