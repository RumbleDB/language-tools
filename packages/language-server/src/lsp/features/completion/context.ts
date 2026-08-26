import { getVisibleDeclarationsAtPosition, type ScopeDefinition } from "server/analysis/index.js";
import type { RumbleWrapperClient } from "server/integrations/rumble/client.js";
import type { ParserService } from "server/parser/index.js";
import { getDocumentText } from "server/parser/utils.js";
import type { WorkspaceService } from "server/workspace/service.js";
import { TextEdit, type Position } from "vscode-languageserver";
import type { TextDocument } from "vscode-languageserver-textdocument";

import type { CompletionContext } from "./types.js";

export function createCompletionContext(
    document: TextDocument,
    position: Position,
    parser: ParserService,
    workspace: WorkspaceService,
    wrapper: RumbleWrapperClient,
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
