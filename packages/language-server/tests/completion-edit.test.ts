import { finalizeCompletionItems } from "server/lsp/features/completion/finalize.js";
import { functionCallInsertion } from "server/lsp/features/completion/providers/snippets.js";
import { describe, expect, it } from "vitest";
import { CompletionItemKind, type TextEdit } from "vscode-languageserver";

import { testDocument } from "./test-utils.js";

function finalize(before: string, after: string, functionName: string, label: string) {
    const source = before + after;
    const [item] = finalizeCompletionItems(
        [
            {
                label,
                kind: CompletionItemKind.Function,
                ...functionCallInsertion(functionName, ["$value"]),
            },
        ],
        {
            document: testDocument(`completion-edit-${label}`, source),
            source,
            cursorOffset: before.length,
        },
        false,
    );
    return item!;
}

describe("function call edits", () => {
    it("inserts the function's name rather than its label before written arguments", () => {
        const item = finalize("con", "cat(1)", "fn:concat", "fn:concat (2 arguments)");

        expect((item.textEdit as TextEdit).newText).toBe("fn:concat");
    });

    it("escapes the name, which stays a snippet", () => {
        const item = finalize("Co", "de(1)", "Q{urn:test}Code", "Code");

        expect((item.textEdit as TextEdit).newText).toBe("Q{urn:test\\}Code");
    });

    it("does not send what only the edit needs to the client", () => {
        expect(finalize("con", "", "fn:concat", "fn:concat")).not.toHaveProperty("functionName");
    });
});
