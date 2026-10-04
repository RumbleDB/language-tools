import { findCompletions } from "server/lsp/features/completion.js";
import { describe, expect, it } from "vitest";
import { CompletionItemKind } from "vscode-languageserver";

import { parserService, workspaceService } from "./services.js";
import { createMockWrapperClient, testDocumentFromUri } from "./test-utils.js";

const wrapper = createMockWrapperClient();

describe.each(["jsoniq", "xquery"])("%s query keyword completion", (languageId) => {
    async function completions(source: string) {
        const document = testDocumentFromUri(source, {
            uri: `file:///keyword-completion-${languageId}-${encodeURIComponent(source)}.${languageId === "jsoniq" ? "jq" : "xq"}`,
            languageId,
        });
        return findCompletions(
            document,
            document.positionAt(source.length),
            parserService,
            workspaceService,
            wrapper,
        );
    }

    async function syntaxLabels(source: string) {
        return (await completions(source))
            .filter((item) =>
                [
                    CompletionItemKind.Keyword,
                    CompletionItemKind.Operator,
                    CompletionItemKind.Value,
                ].includes(item.kind!),
            )
            .map((item) => item.label);
    }

    it("filters name keywords while preserving expression starters and references", async () => {
        const items = await completions("declare variable $global := 1;\nlet $x := ");
        const labels = items.map((item) => item.label);
        expect(labels).toEqual(expect.arrayContaining(["if", "for", "$global", "fn:concat"]));
        for (const label of [
            "case",
            "group by",
            "ascending",
            "or",
            "instance of",
            "copy",
            "delete",
            "while",
            "break loop",
        ]) {
            expect(labels).not.toContain(label);
        }
        // JSONiq has a unary keyword; XQuery uses the not() function.
        expect(labels.includes("not")).toBe(languageId === "jsoniq");
        expect(items.find((item) => item.label === "if")?.kind).toBe(CompletionItemKind.Keyword);
        if (languageId === "jsoniq") {
            expect(items.find((item) => item.label === "not")?.kind).toBe(
                CompletionItemKind.Operator,
            );
            expect(items.find((item) => item.label === "true")?.kind).toBe(
                CompletionItemKind.Value,
            );
        }
    });

    it("offers satisfies after a quantified binding", async () => {
        expect((await completions("some ")).map((item) => item.label)).toEqual(["$"]);
        expect((await syntaxLabels("some $x in (1, 2) "))[0]).toBe("satisfies");
    });

    it("offers sorting directions and modifiers", async () => {
        const labels = await syntaxLabels("for $x in (1, 2) order by $x ");
        expect(labels.slice(0, 2)).toEqual(["ascending", "descending"]);
        expect(labels).toEqual(
            expect.arrayContaining(["ascending", "descending", "empty", "collation"]),
        );
        expect(await syntaxLabels("for $x in (1, 2) order by $x descending empty ")).toEqual(
            expect.arrayContaining(["greatest", "least"]),
        );
    });

    it("completes a manually typed clause phrase", async () => {
        expect(await syntaxLabels("for $x in (1, 2) group ")).toContain("by");
    });

    it("completes return while typing its prefix on the next line", async () => {
        const items = await completions("for $i in 1 to 10\nre");
        expect(items.find((item) => item.label === "return")?.kind).toBe(
            CompletionItemKind.Keyword,
        );
        const afterReturn = await completions("for $i in 1 to 10\nreturn ");
        expect(afterReturn.map((item) => item.label)).toContain("fn:concat");
    });

    it("ranks structural continuations before optional operators", async () => {
        const items = await completions("for $x in (1, 2) ");
        expect(items[0]?.label).toBe("return");
        expect(items[0]!.sortText! < items.find((item) => item.label === "div")!.sortText!).toBe(
            true,
        );
        expect((await syntaxLabels("if (1) "))[0]).toBe("then");
        expect((await syntaxLabels("if (1) then 2 "))[0]).toBe("else");
    });

    it("offers window clauses alongside ordinary for bindings", async () => {
        const items = await completions("for ");
        expect(items.map((item) => item.label)).toEqual(["$", "sliding window", "tumbling window"]);
        expect(items[0]?.kind).toBe(CompletionItemKind.Variable);
        expect((await completions("for tum")).map((item) => item.label)).toContain(
            "tumbling window",
        );
        expect(await syntaxLabels("for tumbling ")).toEqual(["window"]);
        expect((await completions("for tumbling window ")).map((item) => item.label)).toEqual([
            "$",
        ]);
        expect(await completions("for tumbling window $")).toEqual([]);
    });

    it("offers window condition bindings and syntax together", async () => {
        const source = "for tumbling window $w in (1 to 10) ";
        expect((await syntaxLabels(source))[0]).toBe("start");
        const items = await completions(`${source}start `);
        expect(items.map((item) => item.label).sort()).toEqual([
            "$",
            "at",
            "next",
            "previous",
            "when",
        ]);
        expect((await completions(`${source}start $s at `)).map((item) => item.label)).toEqual([
            "$",
        ]);
        expect(await syntaxLabels(`${source}start $s when fn:true() `)).toEqual(
            expect.arrayContaining(["end", "only end", "return"]),
        );
    });

    it("requires an end condition for sliding windows and preserves variable references", async () => {
        const source = "for sliding window $w in (1 to 10) start $s when fn:true() ";
        const labels = await syntaxLabels(source);
        expect(labels.slice(0, 2)).toEqual(["end", "only end"]);
        expect(labels).not.toContain("return");
        expect(await syntaxLabels(`${source}only `)).toEqual(["end"]);
        expect(
            (await completions(`${source}only end $e when fn:true() return $`)).map(
                (item) => item.label,
            ),
        ).toEqual(["$e", "$s", "$w"]);
    });

    it("offers word operators after an operand", async () => {
        const items = await completions("1 ");
        const labels = items.map((item) => item.label);
        expect(labels).toEqual(expect.arrayContaining(["or", "div", "eq", "instance of"]));
        expect(labels).not.toContain("satisfies");
        expect(labels).not.toContain("if");
        expect(labels).not.toContain("not");
        expect(items.find((item) => item.label === "div")?.kind).toBe(CompletionItemKind.Operator);
        expect(items.find((item) => item.label === "instance of")?.kind).toBe(
            CompletionItemKind.Operator,
        );
    });

    it("continues a type operation and then switches to type suggestions", async () => {
        expect(await syntaxLabels("1 instance ")).toContain("of");
        const items = await completions("1 instance of ");
        expect(items.map((item) => item.label)).toContain("xs:string");
        expect(items.some((item) => item.kind === CompletionItemKind.Keyword)).toBe(false);
        expect(items.some((item) => item.kind === CompletionItemKind.Function)).toBe(false);
    });
});
