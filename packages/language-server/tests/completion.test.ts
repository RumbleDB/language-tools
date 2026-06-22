import { findCompletions } from "server/completion.js";
import { describe, expect, it } from "vitest";
import { type CompletionItem, type Position } from "vscode-languageserver";
import { type TextDocument } from "vscode-languageserver-textdocument";

import { positionAtNth, testDocument, testDocumentFromUri } from "./test-utils.js";

describe("JSONiq completion", () => {
    it("returns visible declarations in", () => {
        const document = testDocument("completion-scope", [
            "declare variable $global := 10;",
            "declare function local:f($x) {",
            "  let $y := $x + 1",
            "  return $y + $x + $global",
            "};",
        ]);

        const items = findCompletions(document, positionAtNth(document, "$y", 1));

        expect(labels(items)).toContain("$x");
        expect(labels(items)).toContain("$y");
        expect(labels(items)).toContain("$global");
    });

    it("suggests '$' before typing a variable declaration prefix", () => {
        const document = testDocument("completion-declare-var-name", [
            "declare variable $global := 1;",
            "declare variable ",
        ]);

        const labelsAtCursor = completionLabels(document, {
            line: 1,
            character: "declare variable ".length,
        });

        expect(labelsAtCursor).toEqual(["$"]);
    });

    it("does not suggest anything after typing a variable declaration prefix", () => {
        const document = testDocument("completion-declare-var-name-after-dollar", [
            "declare variable $global := 1;",
            "declare variable $",
        ]);

        const labelsAtCursor = completionLabels(document, {
            line: 1,
            character: "declare variable $".length,
        });

        expect(labelsAtCursor).not.toContain("$");
        expect(labelsAtCursor.length).toBe(0); /// Declaring variable name, avoid any suggestion
    });

    it("does not suggest anything after typing a function parameter prefix", () => {
        const document = testDocument("completion-param-name", [
            "declare function local:f($a, $) {",
            "  1",
            "};",
        ]);

        const labelsAtCursor = completionLabels(document, {
            line: 0,
            character: "declare function local:f($a, $".length,
        });

        expect(labelsAtCursor.length).toBe(0);
    });

    it("suggests only '$' after let before variable name", () => {
        const document = testDocument("completion-let-clause-decl", [
            "declare function x:f($a) {",
            "  let ",
            "};",
        ]);

        const labelsAtCursor = completionLabels(document, {
            line: 1,
            character: "  let ".length,
        });

        expect(labelsAtCursor).toEqual(["$"]);
    });

    it("does not suggest keywords when a function name is expected", () => {
        const document = testDocument("completion-function-name", ["declare function "]);

        const labelsAtCursor = completionLabels(document, {
            line: 0,
            character: "declare function ".length,
        });

        expect(labelsAtCursor.length).toBe(0);
    });

    it("suggests visible variables and expression keywords in expression context", () => {
        const document = testDocument("completion-expression", [
            "declare variable $global := 1;",
            "let $x := ",
        ]);

        const labelsAtCursor = completionLabels(document, {
            line: 1,
            character: "let $x := ".length,
        });

        expect(labelsAtCursor).toContain("$global");
        expect(labelsAtCursor).toContain("if");
        expect(labelsAtCursor).toContain("for");
    });

    it("suggests variables while typing '$' in expression context", () => {
        const document = testDocument("completion-var-prefix", [
            "let $a := 2",
            "let $b := 3",
            "return $",
        ]);

        const labelsAtCursor = completionLabels(document, {
            line: 2,
            character: "return $".length,
        });

        expect(labelsAtCursor).toContain("$a");
        expect(labelsAtCursor).toContain("$b");
        expect(labelsAtCursor).not.toContain("if");
    });

    it("replaces typed variable prefix to avoid duplicating '$'", () => {
        const document = testDocument("completion-var-prefix-text-edit", [
            "let $a := 2",
            "return $",
        ]);
        const position = {
            line: 1,
            character: "return $".length,
        };

        const item = findCompletions(document, position).find(
            (completion) => completion.label === "$a",
        );

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

    it("does not suggest variables when non-expression clause keywords are expected", () => {
        const source = "for $x in 1 ";
        const document = testDocument("completion-flwor-keywords", source);

        const labelsAtCursor = completionLabels(document, {
            line: 0,
            character: source.length,
        });

        expect(labelsAtCursor).toContain("return");
        expect(labelsAtCursor).toContain("where");
        expect(labelsAtCursor).not.toContain("$x");
    });

    it("does not suggest prolog starters inside variable initializer expression", () => {
        const document = testDocument("completion-declare-variable-initializer", [
            "declare variable $x := ",
        ]);

        const labelsAtCursor = completionLabels(document, {
            line: 0,
            character: "declare variable $x := ".length,
        });

        expect(labelsAtCursor).toContain("if");
        expect(labelsAtCursor).not.toContain("declare function");
        expect(labelsAtCursor).not.toContain("declare variable");
        expect(labelsAtCursor).not.toContain("import");
        expect(labelsAtCursor).not.toContain("jsoniq version");
    });

    it("does not suggest declared variable inside its own initializer", () => {
        const document = testDocument("completion-declare-variable-self-initializer", [
            "declare variable $a := ",
        ]);

        const labelsAtCursor = completionLabels(document, {
            line: 0,
            character: "declare variable $a := ".length,
        });

        expect(labelsAtCursor).not.toContain("$a");
    });

    it("does not suggest prolog starters while typing a name in variable initializer expression", () => {
        const document = testDocument("completion-declare-variable-initializer-name", [
            "declare variable $a := f",
        ]);

        const labelsAtCursor = completionLabels(document, {
            line: 0,
            character: "declare variable $a := f".length,
        });

        expect(labelsAtCursor).not.toContain("declare function");
        expect(labelsAtCursor).not.toContain("declare variable");
        expect(labelsAtCursor).not.toContain("import");
        expect(labelsAtCursor).not.toContain("jsoniq version");
    });

    it("does not suggest prolog starters inside function body", () => {
        const document = testDocument("completion-function-body-no-prolog", [
            "declare function x() {",
            "  ",
            "};",
        ]);

        const labelsAtCursor = completionLabels(document, {
            line: 1,
            character: "  ".length,
        });

        expect(labelsAtCursor).not.toContain("declare function");
        expect(labelsAtCursor).not.toContain("declare variable");
        expect(labelsAtCursor).not.toContain("import");
        expect(labelsAtCursor).not.toContain("jsoniq version");
    });

    it("suggests builtin types in type annotation context", () => {
        const document = testDocument("completion-type-annotation", ["declare variable $x as "]);

        const labelsAtCursor = completionLabels(document, {
            line: 0,
            character: "declare variable $x as ".length,
        });

        expect(labelsAtCursor).toContain("xs:string");
        expect(labelsAtCursor).toContain("item");
    });

    it("suggests custom schema types in type annotation context", () => {
        const document = testDocument("completion-custom-type-annotation", [
            'declare namespace app = "http://example.com/app";',
            'declare type app:Item as { "name" : "string" };',
            "declare variable $x as ",
        ]);

        const labelsAtCursor = completionLabels(document, {
            line: 2,
            character: "declare variable $x as ".length,
        });

        expect(labelsAtCursor).toContain("app:Item");
    });

    it("does not throw when completing at the end of a complete document", () => {
        const source = "1 + 2";
        const document = testDocument("completion-complete-document", source);

        const completions = findCompletions(document, {
            line: 0,
            character: source.length,
        });

        expect(completions).toBeDefined();
    });

    it("offers top-level declaration starters in an empty document", () => {
        const document = testDocument("completion-empty-document", "");
        const labelsAtCursor = completionLabels(document, { line: 0, character: 0 });

        expect(labelsAtCursor).toContain("declare function");
        expect(labelsAtCursor).toContain("declare variable");
    });
});

describe("XQuery completion", () => {
    /// This has been added because the original XQuery grammar had string rules that caused the C3 completion engine to freeze.
    it("returns promptly after a long namespace URI before an XML element", () => {
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
        const completions = findCompletions(document, {
            line: 3,
            character: 0,
        });
        const elapsedMs = performance.now() - start;

        expect(completions).toBeDefined();
        expect(elapsedMs).toBeLessThan(1_000);
    });

    it("returns promptly inside an XML enclosed expression after a long attribute URI", () => {
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
        const completions = findCompletions(document, {
            line: 4,
            character: "        return $hr + ".length,
        });
        const elapsedMs = performance.now() - start;

        expect(completions).toBeDefined();
        expect(elapsedMs).toBeLessThan(1_000);
    });
});

function labels(items: CompletionItem[]): string[] {
    return items.map((item) => item.label);
}

function completionLabels(document: TextDocument, position: Position): string[] {
    return labels(findCompletions(document, position));
}
