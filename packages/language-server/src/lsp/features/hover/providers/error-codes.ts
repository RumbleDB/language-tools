import { findNodeThatContainsPosition } from "server/analysis/queries.js";
import { formatErrorCodeDocumentation, getErrorCodeEntry } from "server/resources/error-codes.js";
import { MarkupKind } from "vscode-languageserver";

import type { HoverProvider } from "../types.js";

export const provideErrorCodeHover: HoverProvider = (context) => {
    const node = findNodeThatContainsPosition(context.getAnalysis(), context.position);
    if (node == null || node?.kind !== "error-code-target") {
        return null;
    }

    if (node.target.kind == "wildcard") {
        return {
            range: node.range,
            contents: {
                kind: MarkupKind.Markdown,
                value: `**${node.target.value}** · Error code wildcard`,
            },
        };
    }

    const entry = getErrorCodeEntry(node.target.name);
    if (entry === undefined) {
        return null;
    }

    return {
        range: node.range,
        contents: {
            kind: MarkupKind.Markdown,
            value: formatErrorCodeDocumentation(entry),
        },
    };
};
