import type { Token } from "antlr4ng";
import {
    getVisibleDeclarationsAtPosition,
    QNameToString,
    type AnalysisResult,
    type ScopeDefinition,
    type QName,
} from "server/analysis/index.js";
import type { WrapperClient } from "server/integrations/rumble/client.js";
import type { FocusAtPositionWireResult } from "server/integrations/rumble/operations/focus-at-position/protocol.js";
import { getFocusAtPosition } from "server/integrations/rumble/operations/focus-at-position/service.js";
import { getVariableTypes } from "server/integrations/rumble/operations/static-typecheck/variable-types.js";
import type { ParserService } from "server/parser/index.js";
import type { CompletionIntent } from "server/parser/types/completion.js";
import { defaultTokenAt, defaultTokenBefore, getDocumentText } from "server/parser/utils.js";
import type { WorkspaceService } from "server/workspace/service.js";
import {
    TextEdit,
    type CancellationToken,
    type CompletionItem,
    type Position,
} from "vscode-languageserver";
import type { TextDocument } from "vscode-languageserver-textdocument";

import type { CompletionContext } from "./types.js";

/**
 * How long variable completion waits for RumbleDB to type the document. Once RumbleDB runs, that takes milliseconds,
 * or tens of them for long modules, so the wait mostly ends early just after it starts. The variables are then
 * labelled with their kinds, and the editor asks again as the user types.
 */
const VARIABLE_TYPES_WAIT_MS = 200;

export function createCompletionContext(
    document: TextDocument,
    position: Position,
    parser: ParserService,
    workspace: WorkspaceService,
    wrapper: WrapperClient,
    token?: CancellationToken,
): CompletionContext | null {
    const source = getDocumentText(document);
    const cursorOffset = document.offsetAt(position);
    const intent = parser.collectCompletionIntent(document, cursorOffset);

    if (intent === null) {
        return null;
    }

    // Providers often ask about the start of the same name.
    const intents = new Map<number, CompletionIntent | null>([[cursorOffset, intent]]);
    let visibleDeclarations: Promise<ScopeDefinition[]> | undefined;
    let analysis: Promise<AnalysisResult> | undefined;
    // Object fields and path steps often ask about the same position.
    const focuses = new Map<number, Promise<FocusAtPositionWireResult>>();

    return {
        document,
        source,
        cursorOffset,
        intent,
        getIntentAt(offset) {
            if (!intents.has(offset)) {
                intents.set(offset, parser.collectCompletionIntent(document, offset));
            }
            return intents.get(offset) ?? null;
        },
        getAnalysis() {
            return (analysis ??= workspace.getAnalysis(document));
        },
        getParseResult() {
            return parser.parse(document);
        },
        getFocusAt(offset) {
            let focus = focuses.get(offset);
            if (focus === undefined) {
                focus = getFocusAtPosition(document, document.positionAt(offset), wrapper, token);
                focuses.set(offset, focus);
            }
            return focus;
        },
        getVariableTypes() {
            return getVariableTypes(document, wrapper, { waitMs: VARIABLE_TYPES_WAIT_MS, token });
        },
        getVisibleDeclarations() {
            visibleDeclarations ??= this.getAnalysis().then((analysis) =>
                getVisibleDeclarationsAtPosition(analysis, cursorOffset),
            );
            return visibleDeclarations;
        },
    };
}

/** A token that is a name or keyword, rather than punctuation or a literal. */
const NAME_TOKEN_PATTERN = /^[A-Za-z_]/;

function isNameToken(token: Token | undefined): token is Token {
    return token !== undefined && NAME_TOKEN_PATTERN.test(token.text ?? "");
}

/** Whether the token is a slash that a path step follows. */
export function isPathSlash(token: Token | undefined): boolean {
    return token?.text === "/" || token?.text === "//";
}

/**
 * Where the name that continues up to the offset starts, or the offset when no name ends there. A prefix followed by
 * only a colon is two tokens.
 */
export function nameStart(tokens: Token[], offset: number): number {
    const token = defaultTokenAt(tokens, offset - 1);
    if (token?.text === ":") {
        const prefix = defaultTokenAt(tokens, token.start - 1);
        return isNameToken(prefix) ? prefix.start : offset;
    }
    return isNameToken(token) ? token.start : offset;
}

/** The dot of an object lookup whose field name the cursor is at, as in `$o.¦` or `$o.na¦`, but not `$o.$¦`. */
export function lookupDotAtCursor(
    context: Pick<CompletionContext, "intent" | "cursorOffset" | "getParseResult">,
): Token | undefined {
    const { tokens } = context.getParseResult();
    const dot = defaultTokenBefore(tokens, nameStart(tokens, context.cursorOffset));
    return context.intent.allowObjectLookup && dot?.text === "." ? dot : undefined;
}

/** Where the name up to the offset starts, including a `$` or `@` right before it. */
export function referenceStart(tokens: Token[], offset: number): number {
    const name = nameStart(tokens, offset);
    const sigil = defaultTokenAt(tokens, name - 1)?.text;
    return sigil === "$" || sigil === "@" ? name - 1 : name;
}

/** Where the name at the offset ends, or the offset when there is none. */
export function nameEnd(tokens: Token[], offset: number): number {
    const token = defaultTokenAt(tokens, offset);
    return isNameToken(token) ? token.stop + 1 : offset;
}

/** Offer bound aliases and a local name when the caller supplies a matching default namespace. */
export function getQNameCompletionLabels(
    qname: QName,
    namespaces: ReadonlyMap<string, string>,
    defaultNamespace?: string,
): string[] {
    const prefixes = [...namespaces].filter(([, uri]) => uri === qname.namespaceUri);
    const labels = prefixes.map(([prefix]) => QNameToString({ ...qname, prefix }, false));
    if (defaultNamespace !== undefined && qname.namespaceUri === defaultNamespace) {
        labels.unshift(qname.localName);
    }
    return labels.length === 0 ? [QNameToString(qname, true)] : labels;
}

export function replaceRange(
    document: TextDocument,
    start: number,
    end: number,
    newText: string,
): TextEdit {
    return TextEdit.replace(
        { start: document.positionAt(start), end: document.positionAt(end) },
        newText,
    );
}

/**
 * When the user has typed a namespace prefix (e.g. `fn:`), filters `items` to those
 * whose label starts with the prefix.
 * Returns `null` when no namespace prefix is present, signalling that no filtering
 * should be applied.
 */
export function applyQNamePrefixFilter(
    items: CompletionItem[],
    context: Pick<CompletionContext, "source" | "cursorOffset" | "getParseResult">,
): CompletionItem[] | null {
    const { tokens } = context.getParseResult();
    const nsPrefix = context.source.slice(
        nameStart(tokens, context.cursorOffset),
        context.cursorOffset,
    );
    if (!nsPrefix.endsWith(":")) {
        return null;
    }

    return items.filter((item) => item.label.startsWith(nsPrefix));
}
