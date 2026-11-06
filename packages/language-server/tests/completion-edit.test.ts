import { finalizeCompletionItems } from "server/lsp/features/completion/finalize.js";
import { createFunctionCallSnippet } from "server/lsp/features/completion/providers/snippets.js";
import { describe, expect, it } from "vitest";
import { CompletionItemKind, InsertTextFormat, type TextEdit } from "vscode-languageserver";

import { parserService } from "./services.js";
import { testDocument } from "./test-utils.js";

describe("function call edits", () => {
    it("escapes the name before written arguments, as the item stays a snippet", () => {
        const label = "Q{urn:test}Code";
        const before = "Co";
        const source = `${before}de(1)`;

        const document = testDocument("completion-edit", source);

        const [item] = finalizeCompletionItems(
            [
                {
                    label,
                    kind: CompletionItemKind.Function,
                    insertText: createFunctionCallSnippet(label, ["$value"]),
                    insertTextFormat: InsertTextFormat.Snippet,
                },
            ],
            {
                document,
                source,
                cursorOffset: before.length,
                getParseResult: () => parserService.parse(document),
            },
        );

        expect((item!.textEdit as TextEdit).newText).toBe("Q{urn:test\\}Code");
    });
});
