import { getVisibleDeclarationsAtPosition, type ScopeDefinition } from "server/analysis/index.js";
import type { WrapperClient } from "server/integrations/rumble/client.js";
import type { ParserService } from "server/parser/index.js";
import { getDocumentText } from "server/parser/utils.js";
import type { WorkspaceService } from "server/workspace/service.js";
import { TextEdit, type CompletionItem, type Position } from "vscode-languageserver";
import type { TextDocument } from "vscode-languageserver-textdocument";

import type { CompletionContext } from "./types.js";

export function createCompletionContext(
    document: TextDocument,
    position: Position,
    parser: ParserService,
    workspace: WorkspaceService,
    wrapper: WrapperClient,
): CompletionContext | null {
    const source = getDocumentText(document);
    const cursorOffset = document.offsetAt(position);
    const intent = parser.collectCompletionIntent(document, cursorOffset);

    if (intent === null) {
        return null;
    }

    let visibleDeclarations: ScopeDefinition[] | undefined;

    return {
        document,
        source,
        cursorOffset,
        intent,
        wrapper,
        getVisibleDeclarations() {
            visibleDeclarations ??= getVisibleDeclarationsAtPosition(
                workspace.getAnalysis(document),
                cursorOffset,
            );
            return visibleDeclarations;
        },
    };
}

export function typedPrefix(source: string, cursorOffset: number, pattern: RegExp): string | null {
    return source.slice(0, cursorOffset).match(pattern)?.[0] ?? null;
}

export function replaceTypedPrefix(
    document: TextDocument,
    cursorOffset: number,
    prefix: string,
    newText: string,
): TextEdit {
    return TextEdit.replace(
        {
            start: document.positionAt(cursorOffset - prefix.length),
            end: document.positionAt(cursorOffset),
        },
        newText,
    );
}

/**
 * Matches a namespace prefix immediately before the cursor, e.g. `fn:`, `array:`, `xs:`.
 * The prefix must start with a letter or underscore and end with a colon.
 */
export const QNAME_PREFIX_PATTERN = /[A-Za-z_][A-Za-z0-9_.-]*:$/;

/**
 * When the user has typed a namespace prefix (e.g. `fn:`), filters `items` to those
 * whose label starts with the prefix and adds a `textEdit` that replaces the whole
 * typed prefix so the editor does not produce duplicated prefixes (e.g. `fn:fn:concat`).
 * Returns `null` when no namespace prefix is present, signalling that no filtering
 * should be applied.
 */
export function applyQNamePrefixFilter(
    items: CompletionItem[],
    context: Pick<CompletionContext, "source" | "cursorOffset" | "document">,
): CompletionItem[] | null {
    const nsPrefix = typedPrefix(context.source, context.cursorOffset, QNAME_PREFIX_PATTERN);
    if (nsPrefix === null) {
        return null;
    }

    return items
        .filter((item) => item.label.startsWith(nsPrefix))
        .map((item) => ({
            ...item,
            textEdit: replaceTypedPrefix(
                context.document,
                context.cursorOffset,
                nsPrefix,
                item.insertText ?? item.label,
            ),
        }));
}
