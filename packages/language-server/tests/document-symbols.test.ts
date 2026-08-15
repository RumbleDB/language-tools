import { collectDocumentSymbols } from "server/lsp/features/document-symbols.js";
import { workspaceService } from "server/workspace/service.js";
import { describe, expect, it } from "vitest";
import { DocumentSymbol, SymbolKind } from "vscode-languageserver";

import { testDocument } from "./test-utils.js";

describe("JSONiq document symbols", () => {
    it("collects top-level declarations", async () => {
        const document = testDocument("symbols", [
            'declare namespace app = "https://example.com/app";',
            "declare variable $app:value := 1;",
            'declare context item := { "kind": "context" };',
            "declare type app:Item as object-node();",
            "declare function app:double($x) {",
            "  $x * 2",
            "};",
            "app:double($app:value)",
        ]);

        const symbols = flattenSymbols(await collectDocumentSymbols(document, workspaceService));

        expect(symbols.map((symbol) => [symbol.name, symbol.kind])).toEqual(
            expect.arrayContaining([
                ["app", SymbolKind.Namespace],
                ["$app:value", SymbolKind.Variable],
                ["$$", SymbolKind.Variable],
                ["app:Item", SymbolKind.Struct],
                ["app:double", SymbolKind.Function],
                ["$x", SymbolKind.Variable],
            ]),
        );
    });

    it("collects let-variable bindings", async () => {
        const document = testDocument("let-symbols", ["let $x := 2", "return $x"]);

        const symbols = flattenSymbols(await collectDocumentSymbols(document, workspaceService));

        expect(symbols.map((symbol) => [symbol.name, symbol.kind])).toEqual([
            ["$x", SymbolKind.Variable],
        ]);
    });

    it("nests symbols from a declaration initializer under the declaration symbol", async () => {
        const document = testDocument("nested-let-symbols", [
            "let $a := 3",
            "let $b := (",
            "  let $a := 2",
            "  return true",
            ")",
            "return $a",
        ]);

        const symbols = await collectDocumentSymbols(document, workspaceService);
        const bSymbol = symbols.find((symbol) => symbol.name === "$b");

        expect(symbols.map((symbol) => symbol.name)).toEqual(["$a", "$b"]);
        expect(bSymbol?.children?.map((symbol) => symbol.name)).toEqual(["$a"]);
    });

    it("collects for-variable bindings", async () => {
        const document = testDocument("for-symbols", ["for $x in ( 1, 2 )", "return $x"]);

        const symbols = flattenSymbols(await collectDocumentSymbols(document, workspaceService));

        expect(symbols.map((symbol) => [symbol.name, symbol.kind])).toEqual([
            ["$x", SymbolKind.Variable],
        ]);
    });

    it("collects multiple variables from a single for clause", async () => {
        const document = testDocument("for-multi-symbols", [
            "for $x in (1, 2, 3), $y in (1, 2, 3)",
            "return 10 * $x + $y",
        ]);

        const symbolNames = flattenSymbols(
            await collectDocumentSymbols(document, workspaceService),
        ).map((symbol) => symbol.name);

        expect(symbolNames).toEqual(["$x", "$y"]);
    });

    it("collects function-parameter and FLWOR bindings", async () => {
        const document = testDocument("flowr-symbols", [
            "declare function local:aggregate($seed, $extra as integer) {",
            "  for $x at $pos in (1, 2, 3)",
            "  let $y := $x + $seed",
            "  group by $g := $y mod 2",
            "  count $c",
            "  return $g + $c + $extra",
            "};",
        ]);

        const symbolNames = flattenSymbols(
            await collectDocumentSymbols(document, workspaceService),
        ).map((symbol) => symbol.name);

        expect(symbolNames).toEqual(
            expect.arrayContaining([
                "local:aggregate",
                "$seed",
                "$extra",
                "$x",
                "$pos",
                "$y",
                "$g",
                "$c",
            ]),
        );
        expect(symbolNames).toHaveLength(8);
    });

    it("collects group-by and count bindings in flowr expressions", async () => {
        const document = testDocument("group-count-symbols", [
            "for $x in (1, 2, 3)",
            "group by $group := $x mod 2",
            "count $index",
            'return {"k": $group, "i": $index}',
        ]);

        const symbolNames = flattenSymbols(
            await collectDocumentSymbols(document, workspaceService),
        ).map((symbol) => symbol.name);

        expect(symbolNames).toEqual(["$x", "$group", "$index"]);
    });

    it("never emits empty or invalid symbol names for malformed input", async () => {
        const document = testDocument("broken-symbols", [
            "declare function local:($x) {",
            "  for $ in (1, 2, 3)",
            "  return 1",
        ]);

        const symbols = flattenSymbols(await collectDocumentSymbols(document, workspaceService));

        expect(
            symbols.every((symbol) => symbol.name.trim().length > 0 && symbol.name !== "$"),
        ).toBe(true);
    });

    it("handles incomplete trailing function parameters", async () => {
        const document = testDocument("trailing-parameter-symbols", [
            "declare function local:f($a, $b as integer, ) {",
            "}",
        ]);

        const symbols = flattenSymbols(await collectDocumentSymbols(document, workspaceService));

        expect(symbols.map((symbol) => symbol.name)).toEqual(
            expect.arrayContaining(["local:f", "$a", "$b"]),
        );
        expect(
            symbols.every((symbol) => symbol.name.trim().length > 0 && symbol.name !== "$"),
        ).toBe(true);
    });
});

function flattenSymbols(symbols: DocumentSymbol[]): DocumentSymbol[] {
    const result: DocumentSymbol[] = [];

    const visit = (items: DocumentSymbol[]): void => {
        for (const symbol of items) {
            result.push(symbol);
            if (symbol.children !== undefined && symbol.children.length > 0) {
                visit(symbol.children);
            }
        }
    };

    visit(symbols);
    return result;
}
