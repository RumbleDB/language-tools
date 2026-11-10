import { findCompletions } from "server/lsp/features/completion.js";
import { describe, expect, it } from "vitest";
import { CompletionItemKind } from "vscode-languageserver";

import { parserService, workspaceService } from "./services.js";
import { createMockWrapperClient, testDocumentFromUri } from "./test-utils.js";

const wrapper = createMockWrapperClient();

async function complete(marked: string, languageId = "jsoniq") {
    const offset = marked.indexOf("¦");
    const document = testDocumentFromUri(marked.replace("¦", ""), {
        uri: `file:///type-context-completion-${languageId}-${encodeURIComponent(marked)}.${languageId === "jsoniq" ? "jq" : "xq"}`,
        languageId,
    });
    const items = await findCompletions(
        document,
        document.positionAt(offset),
        parserService,
        workspaceService,
        wrapper,
    );
    return { document, items, labels: items.map((item) => item.label) };
}

describe.each(["jsoniq", "xquery"])("%s type completion contexts", (languageId) => {
    it.each([
        "declare variable $x as array(xs:¦)",
        "declare variable $x as map(xs:¦, item()*)",
        "declare variable $x as map(xs:string, xs:¦)",
        "declare variable $x as function(xs:¦) as item()*",
        "declare variable $x as function(xs:string, xs:¦) as item()*",
        "declare variable $x as (xs:¦)",
        "declare variable $x as element(foo, xs:¦)",
        "declare variable $x as attribute(foo, xs:¦)",
        "typeswitch(1) case xs:¦",
        "typeswitch(1) case xs:integer | xs:¦",
        "typeswitch(1) case $x as xs:integer | xs:¦",
        "1 is statically xs:¦",
        "validate type xs:¦",
    ])("offers types in %s", async (source) => {
        const { items, labels } = await complete(source, languageId);
        expect(labels).toContain("xs:string");
        expect(items.every((item) => item.kind === CompletionItemKind.Class)).toBe(true);
    });

    it.each(["rename json $x as ¦", "rename json $x as $¦"])(
        "offers expressions in %s",
        async (expression) => {
            const { labels, items } = await complete(
                "declare variable $x := 1; " + expression,
                languageId,
            );
            expect(labels).toContain("$x");
            expect(items.some((item) => item.kind === CompletionItemKind.Class)).toBe(false);
        },
    );
});

describe("JSONiq type definitions", () => {
    it("offers schema definition expressions after declare type as", async () => {
        const { labels, items } = await complete("declare type local:T as ¦");
        expect(labels).toContain("fn:concat");
        expect(items.some((item) => item.kind === CompletionItemKind.Class)).toBe(false);
    });
});
