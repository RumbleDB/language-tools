import { findNodeThatContainsPosition } from "server/analysis/queries.js";
import { formatErrorCodeDocumentation } from "server/resources/error-codes.js";
import { MarkupKind } from "vscode-languageserver";

import type { HoverProvider } from "../types.js";

export const provideErrorCodeHover: HoverProvider = (context) => {
    const node = findNodeThatContainsPosition(context.getAnalysis(), context.position);
    if (node?.kind !== "error-code-target" || node.entry === undefined) {
        return null;
    }

    return {
        range: node.range,
        contents: {
            kind: MarkupKind.Markdown,
            value: formatErrorCodeDocumentation(node.entry),
        },
    };
};
