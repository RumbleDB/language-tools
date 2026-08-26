import { findCompletions } from "server/lsp/features/completion.js";
import { describe, expect, it } from "vitest";
import { type CompletionItem, type Position } from "vscode-languageserver";
import { type TextDocument } from "vscode-languageserver-textdocument";

import { parserService, workspaceService, wrapperClient } from "./services.js";
import { positionAtNth, testDocument, testDocumentFromUri } from "./test-utils.js";

describe("JSONiq completion", () => {
    it("returns visible declarations in", async () => {
        const document = testDocument("completion-scope", [
            "declare variable $global := 10;",
            "declare function local:f($x) {",
            "  let $y := $x + 1",
            "  return $y + $x + $global",
            "};",
        ]);

        const items = await findCompletions(
            document,
            positionAtNth(document, "$y", 1),
            parserService,
            workspaceService,
            wrapperClient,
        );

        expect(labels(items)).toContain("$x");
        expect(labels(items)).toContain("$y");
        expect(labels(items)).toContain("$global");
    });

    it("suggests '$' before typing a variable declaration prefix", async () => {
        const document = testDocument("completion-declare-var-name", [
            "declare variable $global := 1;",
            "declare variable ",
        ]);

        const labelsAtCursor = await completionLabels(document, {
            line: 1,
            character: "declare variable ".length,
        });

        expect(labelsAtCursor).toEqual(["$"]);
    });

    it("does not suggest anything after typing a variable declaration prefix", async () => {
        const document = testDocument("completion-declare-var-name-after-dollar", [
            "declare variable $global := 1;",
            "declare variable $",
        ]);

        const labelsAtCursor = await completionLabels(document, {
            line: 1,
            character: "declare variable $".length,
        });

        expect(labelsAtCursor).not.toContain("$");
        expect(labelsAtCursor.length).toBe(0); /// Declaring variable name, avoid any suggestion
    });

    it("does not suggest anything after typing a function parameter prefix", async () => {
        const document = testDocument("completion-param-name", [
            "declare function local:f($a, $) {",
            "  1",
            "};",
        ]);

        const labelsAtCursor = await completionLabels(document, {
            line: 0,
            character: "declare function local:f($a, $".length,
        });

        expect(labelsAtCursor.length).toBe(0);
    });

    it("suggests only '$' after let before variable name", async () => {
        const document = testDocument("completion-let-clause-decl", [
            "declare function x:f($a) {",
            "  let ",
            "};",
        ]);

        const labelsAtCursor = await completionLabels(document, {
            line: 1,
            character: "  let ".length,
        });

        expect(labelsAtCursor).toEqual(["$"]);
    });

    it("does not suggest keywords when a function name is expected", async () => {
        const document = testDocument("completion-function-name", ["declare function "]);

        const labelsAtCursor = await completionLabels(document, {
            line: 0,
            character: "declare function ".length,
        });

        expect(labelsAtCursor.length).toBe(0);
    });

    it("suggests visible variables and expression keywords in expression context", async () => {
        const document = testDocument("completion-expression", [
            "declare variable $global := 1;",
            "let $x := ",
        ]);

        const labelsAtCursor = await completionLabels(document, {
            line: 1,
            character: "let $x := ".length,
        });

        expect(labelsAtCursor).toContain("$global");
        expect(labelsAtCursor).toContain("if");
        expect(labelsAtCursor).toContain("for");
    });

    it("suggests variables while typing '$' in expression context", async () => {
        const document = testDocument("completion-var-prefix", [
            "let $a := 2",
            "let $b := 3",
            "return $",
        ]);

        const labelsAtCursor = await completionLabels(document, {
            line: 2,
            character: "return $".length,
        });

        expect(labelsAtCursor).toContain("$a");
        expect(labelsAtCursor).toContain("$b");
        expect(labelsAtCursor).not.toContain("if");
    });

    it("replaces typed variable prefix to avoid duplicating '$'", async () => {
        const document = testDocument("completion-var-prefix-text-edit", [
            "let $a := 2",
            "return $",
        ]);
        const position = {
            line: 1,
            character: "return $".length,
        };

        const item = (
            await findCompletions(
                document,
                position,
                parserService,
                workspaceService,
                wrapperClient,
            )
        ).find((completion) => completion.label === "$a");

        expect(item?.textEdit).toEqual({
            range: {
                start: {
                    line: 1,
                    character: "return ".length,
                },
                end: {
                    line: 1,
                    character: "return $".length,
                },
            },
            newText: "$a",
        });
    });

    it("suggests prefixed W3C error codes and wildcard patterns in a catch target", async () => {
        const document = testDocument("completion-catch-error", "try { 1 div 0 } catch ");
        const position = document.positionAt(document.getText().length);
        const items = await findCompletions(
            document,
            position,
            parserService,
            workspaceService,
            wrapperClient,
        );

        expect(labels(items)).toContain("err:FOAR0001");
        expect(labels(items)).toContain("*");
        expect(labels(items)).toContain("err:*");
        expect(labels(items)).not.toContain("fn:abs");
    });

    it("filters and replaces a partially typed catch error code", async () => {
        const document = testDocument(
            "completion-catch-error-prefix",
            "try { 1 div 0 } catch err:FOAR",
        );
        const position = document.positionAt(document.getText().length);
        const item = (
            await findCompletions(
                document,
                position,
                parserService,
                workspaceService,
                wrapperClient,
            )
        ).find((completion) => completion.label === "err:FOAR0001");

        expect(item?.textEdit).toEqual({
            range: {
                start: document.positionAt(document.getText().length - "err:FOAR".length),
                end: position,
            },
            newText: "err:FOAR0001",
        });
        expect(item?.documentation).toMatchObject({
            value: expect.stringContaining("Division by zero."),
        });
    });

    it("does not suggest variables when non-expression clause keywords are expected", async () => {
        const source = "for $x in 1 ";
        const document = testDocument("completion-flwor-keywords", source);

        const labelsAtCursor = await completionLabels(document, {
            line: 0,
            character: source.length,
        });

        expect(labelsAtCursor).toContain("return");
        expect(labelsAtCursor).toContain("where");
        expect(labelsAtCursor).not.toContain("$x");
    });

    it("does not suggest prolog starters inside variable initializer expression", async () => {
        const document = testDocument("completion-declare-variable-initializer", [
            "declare variable $x := ",
        ]);

        const labelsAtCursor = await completionLabels(document, {
            line: 0,
            character: "declare variable $x := ".length,
        });

        expect(labelsAtCursor).toContain("if");
        expect(labelsAtCursor).not.toContain("declare function");
        expect(labelsAtCursor).not.toContain("declare variable");
        expect(labelsAtCursor).not.toContain("import");
        expect(labelsAtCursor).not.toContain("jsoniq version");
    });

    it("does not suggest declared variable inside its own initializer", async () => {
        const document = testDocument("completion-declare-variable-self-initializer", [
            "declare variable $a := ",
        ]);

        const labelsAtCursor = await completionLabels(document, {
            line: 0,
            character: "declare variable $a := ".length,
        });

        expect(labelsAtCursor).not.toContain("$a");
    });

    it("does not suggest prolog starters while typing a name in variable initializer expression", async () => {
        const document = testDocument("completion-declare-variable-initializer-name", [
            "declare variable $a := f",
        ]);

        const labelsAtCursor = await completionLabels(document, {
            line: 0,
            character: "declare variable $a := f".length,
        });

        expect(labelsAtCursor).not.toContain("declare function");
        expect(labelsAtCursor).not.toContain("declare variable");
        expect(labelsAtCursor).not.toContain("import");
        expect(labelsAtCursor).not.toContain("jsoniq version");
    });

    it("does not suggest prolog starters inside function body", async () => {
        const document = testDocument("completion-function-body-no-prolog", [
            "declare function x() {",
            "  ",
            "};",
        ]);

        const labelsAtCursor = await completionLabels(document, {
            line: 1,
            character: "  ".length,
        });

        expect(labelsAtCursor).not.toContain("declare function");
        expect(labelsAtCursor).not.toContain("declare variable");
        expect(labelsAtCursor).not.toContain("import");
        expect(labelsAtCursor).not.toContain("jsoniq version");
    });

    it("suggests builtin types in type annotation context", async () => {
        const document = testDocument("completion-type-annotation", ["declare variable $x as "]);

        const labelsAtCursor = await completionLabels(document, {
            line: 0,
            character: "declare variable $x as ".length,
        });

        expect(labelsAtCursor).toContain("xs:string");
        expect(labelsAtCursor).toContain("item");
    });

    it("suggests custom schema types in type annotation context", async () => {
        const document = testDocument("completion-custom-type-annotation", [
            'declare namespace app = "http://example.com/app";',
            'declare type app:Item as { "name" : "string" };',
            "declare variable $x as ",
        ]);

        const labelsAtCursor = await completionLabels(document, {
            line: 2,
            character: "declare variable $x as ".length,
        });

        expect(labelsAtCursor).toContain("app:Item");
    });

    it("does not throw when completing at the end of a complete document", async () => {
        const source = "1 + 2";
        const document = testDocument("completion-complete-document", source);

        const completions = await findCompletions(
            document,
            { line: 0, character: source.length },
            parserService,
            workspaceService,
            wrapperClient,
        );

        expect(completions).toBeDefined();
    });

    it("offers top-level declaration starters in an empty document", async () => {
        const document = testDocument("completion-empty-document", "");
        const labelsAtCursor = await completionLabels(document, { line: 0, character: 0 });

        expect(labelsAtCursor).toContain("declare function");
        expect(labelsAtCursor).toContain("declare variable");
    });

    it("suggests object fields after the dot operator using real type inference", async () => {
        const document = testDocument("completion-dot-object", [
            "declare variable $a := {",
            '  "name": "Ada",',
            '  "age": 42',
            "};",
            "",
            "$a.",
        ]);

        const items = await findCompletions(
            document,
            { line: 5, character: 3 },
            parserService,
            workspaceService,
            wrapperClient,
        );

        expect(labels(items)).toContain("age");
        expect(labels(items)).toContain("name");
        expect(items.find((item) => item.label === "name")?.textEdit).toEqual({
            range: {
                start: { line: 5, character: 3 },
                end: { line: 5, character: 3 },
            },
            newText: "name",
        });
    }, 45_000);

    it("filters real object field completions by the prefix typed after dot", async () => {
        const document = testDocument("completion-dot-object-prefix", [
            "declare variable $a := {",
            '  "name": "Ada",',
            '  "age": 42',
            "};",
            "",
            "$a.na",
        ]);

        const items = await findCompletions(
            document,
            { line: 5, character: 5 },
            parserService,
            workspaceService,
            wrapperClient,
        );

        expect(labels(items)).toContain("name");
        expect(items.find((item) => item.label === "name")?.textEdit).toEqual({
            range: {
                start: { line: 5, character: 3 },
                end: { line: 5, character: 5 },
            },
            newText: "name",
        });
    }, 45_000);
});

describe("XQuery completion", () => {
    it("suggests prefixed W3C error codes in a catch target", async () => {
        const document = testDocumentFromUri("try { 1 div 0 } catch err:FOAR", {
            uri: "file:///completion-catch-error.xq",
            languageId: "xquery",
        });
        const position = document.positionAt(document.getText().length);
        const labelsAtCursor = labels(
            await findCompletions(
                document,
                position,
                parserService,
                workspaceService,
                wrapperClient,
            ),
        );

        expect(labelsAtCursor).toContain("err:FOAR0001");
    });

    /// This has been added because the original XQuery grammar had string rules that caused the C3 completion engine to freeze.
    it("returns promptly after a long namespace URI before an XML element", async () => {
        const document = testDocumentFromUri(
            [
                'xquery version "3.1";',
                'declare namespace xlink = "http://www.w3.org/1999/xlink";',
                "",
                '<Q4 xmlns:xlink="http://www.w3.org/1999/xlink">',
                "    ",
                "</Q4>",
            ],
            {
                uri: "file:///completion-long-namespace.xq",
                languageId: "xquery",
            },
        );

        const start = performance.now();
        const completions = await findCompletions(
            document,
            { line: 3, character: 0 },
            parserService,
            workspaceService,
            wrapperClient,
        );
        const elapsedMs = performance.now() - start;

        expect(completions).toBeDefined();
        expect(elapsedMs).toBeLessThan(1_000);
    });

    it("returns promptly inside an XML enclosed expression after a long attribute URI", async () => {
        const document = testDocumentFromUri(
            [
                'declare namespace xlink = "http://www.w3.org/1999/xlink"; ',
                '<Q4 xmlns:xlink="http://www.w3.org/1999/xlink"> ',
                "    { ",
                "        for $hr in //@xlink:href ",
                "        return $hr + ",
                "    } ",
                "</Q4>",
            ],
            {
                uri: "file:///completion-long-attribute-uri.xq",
                languageId: "xquery",
            },
        );

        const start = performance.now();
        const completions = await findCompletions(
            document,
            { line: 4, character: "        return $hr + ".length },
            parserService,
            workspaceService,
            wrapperClient,
        );
        const elapsedMs = performance.now() - start;

        expect(completions).toBeDefined();
        expect(elapsedMs).toBeLessThan(1_000);
    });
});

function labels(items: CompletionItem[]): string[] {
    return items.map((item) => item.label);
}

async function completionLabels(document: TextDocument, position: Position): Promise<string[]> {
    return labels(
        await findCompletions(document, position, parserService, workspaceService, wrapperClient),
    );
}
