import { findCompletions, resolveCompletionItem } from "server/lsp/features/completion.js";
import { describe, expect, it } from "vitest";
import { CancellationTokenSource, MarkupKind } from "vscode-languageserver";

import { parserService, workspaceService, wrapperClient } from "./services.js";
import { createMockWrapperClient, testDocumentFromUri } from "./test-utils.js";

function documentAtEnd(name: string, source: string) {
    const document = testDocumentFromUri(source, { uri: `file:///${name}.jq` });
    return { document, position: document.positionAt(source.length) };
}

/** A wrapper whose answers never arrive, but which, like the real one, rejects a request when it is cancelled. */
const silentWrapper = createMockWrapperClient({
    sendRequest: (_request, options) =>
        new Promise((_resolve, reject) => {
            options?.token?.onCancellationRequested(() =>
                reject(new Error("Operation was cancelled.")),
            );
        }),
});

describe("completion item resolution", () => {
    it("documents builtin functions only when an item is resolved", async () => {
        const { document, position } = documentAtEnd("resolve-builtin", "con");
        const items = await findCompletions(
            document,
            position,
            parserService,
            workspaceService,
            wrapperClient,
        );
        const item = items.find((candidate) => candidate.label === "fn:concat");

        expect(item).toBeDefined();
        expect(item?.documentation).toBeUndefined();
        expect(resolveCompletionItem(item!).documentation).toMatchObject({
            kind: MarkupKind.Markdown,
            value: expect.stringContaining("concat"),
        });
    });

    it("leaves other items unchanged", () => {
        const item = { label: "return" };
        expect(resolveCompletionItem(item)).toBe(item);
    });
});

describe("completion cancelled while RumbleDB is busy", () => {
    it("stops waiting for RumbleDB", async () => {
        const { document, position } = documentAtEnd(
            "slow-wrapper-cancel",
            'declare variable $o := {"a": 1}; $o.',
        );
        const cancellation = new CancellationTokenSource();
        const items = findCompletions(
            document,
            position,
            parserService,
            workspaceService,
            silentWrapper,
            cancellation.token,
        );
        cancellation.cancel();

        // The editor ignores the answer to a cancelled request; it only matters that one is given.
        await expect(items).resolves.toEqual([]);
    });
});
