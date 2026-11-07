import { findCompletions } from "server/lsp/features/completion.js";
import { describe, expect, it } from "vitest";
import {
    CompletionItemKind,
    InsertTextFormat,
    type CompletionItem,
    type Position,
    type TextEdit,
} from "vscode-languageserver";
import { TextDocument } from "vscode-languageserver-textdocument";

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
        expect(items.find((item) => item.label === "$y")?.labelDetails?.description).toBe(
            "Variable",
        );
        expect(items.find((item) => item.label === "$x")?.labelDetails?.description).toBe(
            "Parameter",
        );
    });

    it("suggests '$' before typing a variable declaration prefix", async () => {
        const document = testDocument("completion-declare-var-name", [
            "declare variable $global := 1;",
            "declare variable ",
        ]);

        const items = await findCompletions(
            document,
            { line: 1, character: "declare variable ".length },
            parserService,
            workspaceService,
            wrapperClient,
        );

        expect(items).toEqual([
            expect.objectContaining({
                label: "$",
                kind: CompletionItemKind.Variable,
                labelDetails: { description: "Variable" },
            }),
        ]);
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

    it("does not suggest functions after typing a colon in a variable binding like 'let $a :'", async () => {
        const document = testDocument("completion-let-var-colon", ["let $a :"]);

        const labelsAtCursor = await completionLabels(document, {
            line: 0,
            character: "let $a :".length,
        });

        expect(labelsAtCursor.some((label) => label.startsWith("fn:"))).toBe(false);
    });

    it.each([
        ["completion-function-name", "declare function "],
        ["completion-annotated-function-name", "declare %an:x function "],
    ])(
        "does not suggest anything when a function name is expected (%s)",
        async (name, declaration) => {
            const document = testDocument(name, [declaration]);

            const labelsAtCursor = await completionLabels(document, {
                line: 0,
                character: declaration.length,
            });

            expect(labelsAtCursor.length).toBe(0);
        },
    );

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

    it.each(["jsoniq", "xquery"])(
        "suggests variables and functions inside function call arguments (%s)",
        async (languageId) => {
            const document = testDocumentFromUri("let $a := 1\nreturn fn:abs($)", {
                uri: `file:///completion-var-in-argument-${languageId}`,
                languageId,
            });

            const afterDollar = await completionLabels(document, {
                line: 1,
                character: "return fn:abs($".length,
            });
            const emptyArgument = await completionLabels(document, {
                line: 1,
                character: "return fn:abs(".length,
            });

            expect(afterDollar).toContain("$a");
            expect(emptyArgument).toContain("$a");
            expect(emptyArgument).toContain("fn:abs");
        },
    );

    it.each([
        ["jsoniq", true],
        ["xquery", false],
    ])("suggests the context item as '$$' only in JSONiq (%s)", async (languageId, offered) => {
        const document = testDocumentFromUri("(1, 2)[$]", {
            uri: `file:///completion-context-item-${languageId}`,
            languageId,
        });

        const labelsAtCursor = await completionLabels(document, {
            line: 0,
            character: "(1, 2)[$".length,
        });

        expect(labelsAtCursor.includes("$$")).toBe(offered);
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

    it.each([
        ["string", 'let $u := "http://example.org/" return $u', '"http://example.org/'],
        ["comment", "let $x := 1 (: see a/b :) return $x", "(: see a/"],
    ])("suggests nothing inside a %s", async (kind, source, beforeCursor) => {
        const document = testDocument(`completion-inside-${kind}`, source);
        const cursor = source.indexOf(beforeCursor) + beforeCursor.length;

        expect(await completionLabels(document, document.positionAt(cursor))).toEqual([]);
    });

    it("offers top-level declaration starters in an empty document", async () => {
        const document = testDocument("completion-empty-document", "");
        const labelsAtCursor = await completionLabels(document, { line: 0, character: 0 });

        expect(labelsAtCursor).toContain("declare function");
        expect(labelsAtCursor).toContain("declare variable");
    });

    it("suggests object fields after the dot operator using real type inference", async () => {
        const document = testDocument("completion-dot-object", [
            `declare variable $a := ${JSON.stringify({
                name: "Ada",
                age: 42,
                "full name": "Ada Lovelace",
                "a.b": true,
                "1st": 1,
                'say "hi"\\there': "hello",
            })};`,
            "$a.",
        ]);

        const position = document.positionAt(document.getText().length);
        const items = await findCompletions(
            document,
            position,
            parserService,
            workspaceService,
            wrapperClient,
        );

        expect(labels(items)).toContain("age");
        expect(labels(items)).toContain("name");
        for (const [label, newText] of [
            ["name", "name"],
            ["full name", '"full name"'],
            ["a.b", '"a.b"'],
            ["1st", '"1st"'],
            ['say "hi"\\there', '"say \\"hi\\"\\\\there"'],
        ]) {
            expect(items.find((item) => item.label === label)?.textEdit).toEqual({
                range: { start: position, end: position },
                newText,
            });
        }
    }, 45_000);

    it("filters real object field completions by the prefix typed after dot", async () => {
        const document = testDocument("completion-dot-object-prefix", [
            "declare variable $a := {",
            '  "name": "Ada",',
            '  "name with spaces": "Ada Lovelace",',
            '  "age": 42',
            "};",
            "",
            "$a.na",
        ]);

        const items = await findCompletions(
            document,
            { line: 6, character: 5 },
            parserService,
            workspaceService,
            wrapperClient,
        );

        expect(labels(items)).toContain("name");
        expect(items.find((item) => item.label === "name")?.textEdit).toEqual({
            range: {
                start: { line: 6, character: 3 },
                end: { line: 6, character: 5 },
            },
            newText: "name",
        });
        expect(items.find((item) => item.label === "name with spaces")?.textEdit).toEqual({
            range: {
                start: { line: 6, character: 3 },
                end: { line: 6, character: 5 },
            },
            newText: '"name with spaces"',
        });
    }, 45_000);

    it("suggests object fields when an enclosing expression ends at the dot", async () => {
        for (const [name, query] of [
            ["if", "if (true) then 1 else $a."],
            ["comma", "1, $a."],
            ["flwor", "for $x in (1, 2) return if ($x eq 1) then 1 else $a."],
        ]) {
            const document = testDocument(`completion-dot-object-enclosing-${name}`, [
                'declare variable $a := {"name": "Ada", "age": 42};',
                query,
            ]);

            const items = await findCompletions(
                document,
                document.positionAt(document.getText().length),
                parserService,
                workspaceService,
                wrapperClient,
            );

            expect(labels(items), query).toEqual(expect.arrayContaining(["age", "name"]));
        }
    }, 45_000);

    it.each([
        ["the name after the cursor", "$a.", "test", "c", "$a.c"],
        ["the name around the cursor", "$a.te", "st", "test", "$a.test"],
        ["a quoted name after the cursor", "$a.", '"test"', "c", "$a.c"],
        ["a quoted name with an escaped quote", "$a.", '"te\\"st"', "c", "$a.c"],
        ["only this name in a chain", "$a.", "test.c", "c", "$a.c.c"],
        ["nothing on the next line", "$a.", "\nreturn $a", "c", "$a.c\nreturn $a"],
    ])(
        "replaces %s when accepting an object field",
        async (name, before, after, label, expected) => {
            const prefix = 'let $a := {"test": 1, "c": 2} order by ';
            const document = testDocument(
                `completion-dot-object-replace-${encodeURIComponent(name)}`,
                [prefix + before + after],
            );

            const items = await findCompletions(
                document,
                document.positionAt(prefix.length + before.length),
                parserService,
                workspaceService,
                wrapperClient,
            );

            const edit = items.find((item) => item.label === label)?.textEdit as TextEdit;
            expect(TextDocument.applyEdits(document, [edit])).toBe(prefix + expected);
        },
        45_000,
    );

    it.each([
        [
            "a keyword around the cursor",
            "let $a := 1 re",
            "turn 1",
            "return",
            "let $a := 1 return 1",
        ],
        [
            "a variable around the cursor",
            "let $abc := 1 return $a",
            "bc",
            "$abc",
            "let $abc := 1 return $abc",
        ],
        [
            "only the variable before a lookup",
            "let $abc := 1 return $a",
            "bc.x",
            "$abc",
            "let $abc := 1 return $abc.x",
        ],
        [
            "a builtin type around the cursor",
            "1 cast as xs:int",
            "eger",
            "xs:integer",
            "1 cast as xs:integer",
        ],
        [
            "a builtin type after its prefix",
            "1 cast as xs:",
            "integer",
            "xs:string",
            "1 cast as xs:string",
        ],
        [
            "an error code around the cursor",
            "try { 1 } catch err:FO",
            "AR0001 { 2 }",
            "err:FOAR0002",
            "try { 1 } catch err:FOAR0002 { 2 }",
        ],
    ])(
        "replaces %s when accepting an item",
        async (_name, before, after, label, expected) => {
            const document = testDocument(
                `completion-replace-${_name.replaceAll(" ", "-")}`,
                before + after,
            );

            const items = await findCompletions(
                document,
                document.positionAt(before.length),
                parserService,
                workspaceService,
                wrapperClient,
            );

            const edit = items.find((item) => item.label === label)?.textEdit as TextEdit;
            expect(TextDocument.applyEdits(document, [edit])).toBe(expected);
        },
        45_000,
    );

    it("replaces the whole name with a function call snippet", async () => {
        const before = "fn:con";
        const document = testDocument("completion-replace-function", `${before}cat`);

        const items = await findCompletions(
            document,
            document.positionAt(before.length),
            parserService,
            workspaceService,
            wrapperClient,
        );

        const item = items.find((candidate) => candidate.label === "fn:abs");
        expect(item?.insertTextFormat).toBe(InsertTextFormat.Snippet);
        expect(TextDocument.applyEdits(document, [item?.textEdit as TextEdit])).toBe(
            item?.insertText,
        );
    }, 45_000);

    it.each([
        ["a keyword", "let $a := 1 ", "return 1", "where"],
        ["a variable", "let $abc := 1 return ", "$abc", "$abc"],
    ])(
        "inserts in front of %s after the cursor",
        async (_name, before, after, label) => {
            const document = testDocument(`completion-insert-before-${label}`, before + after);

            const items = await findCompletions(
                document,
                document.positionAt(before.length),
                parserService,
                workspaceService,
                wrapperClient,
            );

            const edit = items.find((item) => item.label === label)?.textEdit as TextEdit;
            expect(TextDocument.applyEdits(document, [edit])).toBe(`${before}${label}${after}`);
        },
        45_000,
    );

    it.each([
        [
            "a variable",
            "let $abc := 1 return { $a",
            ": 1 }",
            "$abc",
            "let $abc := 1 return { $abc: 1 }",
        ],
        ["a keyword", "{ tr", ": 1 }", "true", "{ true: 1 }"],
        [
            "an assignment",
            "variable $abc := 1; $ab",
            ":= 3",
            "$abc",
            "variable $abc := 1; $abc:= 3",
        ],
        [
            "an object field",
            'let $o := {"bc": 1} return { $o.b',
            ": 1 }",
            "bc",
            'let $o := {"bc": 1} return { $o.bc: 1 }',
        ],
        [
            "a variable with no space",
            "let $abc := 1 return { $a",
            ":1 }",
            "$abc",
            "let $abc := 1 return { $abc:1 }",
        ],
        ["a keyword with no space", "{ tr", ":1 }", "true", "{ true:1 }"],
        [
            "an object field with no space",
            'let $o := {"bc": 1} return { $o.b',
            ":1 }",
            "bc",
            'let $o := {"bc": 1} return { $o.bc:1 }',
        ],
    ])(
        "keeps a colon after %s",
        async (name, before, after, label, expected) => {
            const document = testDocument(
                `completion-keep-colon-${name.replaceAll(" ", "-")}`,
                before + after,
            );

            const items = await findCompletions(
                document,
                document.positionAt(before.length),
                parserService,
                workspaceService,
                wrapperClient,
            );

            const edit = items.find((item) => item.label === label)?.textEdit as TextEdit;
            expect(TextDocument.applyEdits(document, [edit])).toBe(expected);
        },
        45_000,
    );

    it.each([
        ["a parenthesized expression", "", "(1, 2)"],
        ["a pragma", "con", "cat (# p #) { 1 }"],
    ])(
        "inserts the whole call before %s",
        async (name, before, after) => {
            const document = testDocument(`completion-whole-call-${name}`, before + after);

            const items = await findCompletions(
                document,
                document.positionAt(before.length),
                parserService,
                workspaceService,
                wrapperClient,
            );

            const item = items.find((candidate) => candidate.label === "fn:concat");
            expect((item!.textEdit as TextEdit).newText).toBe(item!.insertText);
        },
        45_000,
    );

    it.each([
        ["a space", "$a. ", "", "$a. bc"],
        ["a space and a name", "$a. b", "", "$a. bc"],
        ["a new line", "$a.\n", "", "$a.\nbc"],
        ["a new line and a name", "$a.\nb", "", "$a.\nbc"],
        ["a comment", "$a.(: c :)", "", "$a.(: c :)bc"],
        ["a comment and a name", "$a.(: c :) b", "", "$a.(: c :) bc"],
        ["a name after the cursor", "$a. b", "x", "$a. bc"],
    ])(
        "suggests object fields after a dot and %s",
        async (name, before, after, expected) => {
            const prefix = 'let $a := {"bc": 1} return ';
            const document = testDocument(
                `completion-spaced-dot-${encodeURIComponent(name)}`,
                prefix + before + after,
            );

            await expect(acceptItem(document, prefix.length + before.length, "bc")).resolves.toBe(
                prefix + expected,
            );
        },
        45_000,
    );

    it("does not suggest object fields after a finished lookup", async () => {
        const source = 'let $a := {"bc": 1} return $a.bc ';
        const document = testDocument("completion-after-lookup", source);

        const items = await findCompletions(
            document,
            document.positionAt(source.length),
            parserService,
            workspaceService,
            wrapperClient,
        );

        expect(items.map((item) => item.label)).not.toContain("bc");
    }, 45_000);

    it.each([
        ["after a comment", "con", "cat (: c :) (1)", "fn:concat", "fn:concat (: c :) (1)"],
        [
            "after a slash",
            "let $a := 1 return $a/",
            "test(1)",
            "fn:abs",
            "let $a := 1 return $a/fn:abs(1)",
        ],
    ])(
        "only inserts the name of a function before arguments %s",
        async (_name, before, after, label, expected) => {
            const document = testDocument(`completion-called-${before}${after}`, before + after);

            await expect(acceptItem(document, before.length, label)).resolves.toBe(expected);
        },
        45_000,
    );

    it("replaces a name after a slash with any item", async () => {
        const before = "let $a := 1 return $a/";
        const source = `${before}test`;
        const document = testDocument("completion-after-slash", source);

        const items = await findCompletions(
            document,
            document.positionAt(before.length),
            parserService,
            workspaceService,
            wrapperClient,
        );

        const item = items.find((candidate) => candidate.label === "fn:abs");
        expect(TextDocument.applyEdits(document, [item!.textEdit as TextEdit])).toBe(
            `${before}${item!.insertText}`,
        );
    }, 45_000);

    it("replaces a wildcard in an error code", async () => {
        const before = "try { 1 } catch err:";
        const source = `${before}* { 2 }`;
        const document = testDocument("completion-error-wildcard", source);

        await expect(acceptItem(document, before.length, "err:FOAR0001")).resolves.toBe(
            "try { 1 } catch err:FOAR0001 { 2 }",
        );
    }, 45_000);

    it.each([
        ["for $x in 1 or", "der by $x return 1", "order by", "for $x in 1 order by $x return 1"],
        ["for $x in 1 gr", "oup by $x return 1", "group by", "for $x in 1 group by $x return 1"],
        ["for $x in 1 or", "der by\n$x return 1", "order by", "for $x in 1 order by\n$x return 1"],
        ["for $x in 1 or", "der $x return 1", "order by", "for $x in 1 order by $x return 1"],
        [
            "for $x in 1 or",
            "der\nby $x return 1",
            "order by",
            "for $x in 1 order by\nby $x return 1",
        ],
        ["for $x in 1 ", "order by $x return 1", "where", "for $x in 1 whereorder by $x return 1"],
        ["1 instan", "ce of xs:int", "instance of", "1 instance of xs:int"],
        ["1 ca", "st as xs:int", "cast as", "1 cast as xs:int"],
        [
            "for $x in 1 or",
            "der (: c :) by $x return 1",
            "order by",
            "for $x in 1 order (: c :) by $x return 1",
        ],
        ["1 inst", "ance (: c :) of xs:int", "instance of", "1 instance (: c :) of xs:int"],
        ["1 inst", "ance   of xs:int", "instance of", "1 instance   of xs:int"],
    ])(
        "replaces the written words of a keyword at %s|%s",
        async (before, after, label, expected) => {
            const document = testDocument(
                `completion-words-${before}${after}${label}`,
                before + after,
            );

            await expect(acceptItem(document, before.length, label)).resolves.toBe(expected);
        },
        45_000,
    );

    it("treats a dot as part of a name in XQuery", async () => {
        const before = "let $a.b := 1 return $a";
        const source = `${before}.b`;
        const document = testDocumentFromUri(source, {
            uri: "file:///completion-xquery-dot.xq",
            languageId: "xquery",
        });

        await expect(acceptItem(document, before.length, "$a.b")).resolves.toBe(
            "let $a.b := 1 return $a.b",
        );
    }, 45_000);

    it.each([
        ["a name being edited", "con", "cat(1)", "fn:concat", "fn:concat(1)"],
        ["the start of a name", "con", "(1)", "fn:concat", "fn:concat(1)"],
        ["a space before the arguments", "con", "cat (1)", "fn:concat", "fn:concat (1)"],
        ["a name after its prefix", "fn:", "concat(1)", "fn:abs", "fn:abs(1)"],
        [
            "a declared function",
            "declare function local:f($x) { $x }; local:",
            "f(1)",
            "local:f",
            "declare function local:f($x) { $x }; local:f(1)",
        ],
        ["a function reference", "con", "cat#2", "fn:concat", "fn:concat#2"],
        ["a space before the arity", "con", "cat #2", "fn:concat", "fn:concat #2"],
    ])(
        "keeps the arguments or arity already written after %s",
        async (_name, before, after, label, expected) => {
            const document = testDocument(
                `completion-keeps-arguments-${_name.replaceAll(" ", "-")}`,
                before + after,
            );

            const items = await findCompletions(
                document,
                document.positionAt(before.length),
                parserService,
                workspaceService,
                wrapperClient,
            );

            const edit = items.find((item) => item.label === label)?.textEdit as TextEdit;
            expect(TextDocument.applyEdits(document, [edit])).toBe(expected);
        },
        45_000,
    );

    it.each([
        ["no parenthesis follows", "con", "", ""],
        ["the parenthesis is on another line", "con", "\n(1)", "\n(1)"],
        ["a comment follows", "con", "(: note :)", "(: note :)"],
        ["a comment follows after a space", "con", " (: note :)", " (: note :)"],
        ["the function goes in front of a call", "", "concat(1)", "concat(1)"],
    ])(
        "inserts the call snippet when %s",
        async (_name, before, after, kept) => {
            const document = testDocument(
                `completion-call-snippet-${_name.replaceAll(" ", "-")}`,
                before + after,
            );

            const items = await findCompletions(
                document,
                document.positionAt(before.length),
                parserService,
                workspaceService,
                wrapperClient,
            );

            const item = items.find((candidate) => candidate.label === "fn:concat");
            expect(item?.insertText).toContain("fn:concat(");
            expect(TextDocument.applyEdits(document, [item?.textEdit as TextEdit])).toBe(
                `${item?.insertText}${kept}`,
            );
        },
        45_000,
    );

    it("suggests object fields in a query that is still being typed", async () => {
        const binding = 'let $a := {"name": "Ada", "age": 42}';
        for (const [name, source, after] of [
            ["no-return", `${binding} let $b := $a.`, ""],
            ["unclosed-paren", `${binding} return ($a.`, ""],
            ["unclosed-call", `${binding} return abs($a.`, ""],
            ["broken-next-clause", `${binding} let $b := $a.`, " let $c := return 1"],
            ["undeclared-later", `${binding} let $b := $a.`, " return $nope"],
            ["before-existing-code", `${binding} let $b := $a.`, "\nreturn $b"],
            ["before-other-lookups", `${binding} return ($a.`, ", $a.age)"],
        ] as const) {
            const document = testDocument(`completion-dot-object-incomplete-${name}`, [
                source + after,
            ]);

            const items = await findCompletions(
                document,
                document.positionAt(source.length),
                parserService,
                workspaceService,
                wrapperClient,
            );

            expect(labels(items), source + after).toEqual(expect.arrayContaining(["age", "name"]));
        }
    }, 45_000);

    it("suggests builtin functions when typing 'fn:' in JSONiq", async () => {
        const document = testDocument("completion-fn-prefix", "fn:");
        const items = await findCompletions(
            document,
            document.positionAt(3),
            parserService,
            workspaceService,
            wrapperClient,
        );

        expect(labels(items)).toContain("fn:string-join");
        expect(labels(items)).toContain("fn:concat");
        expect(items.find((item) => item.label === "fn:true")).toMatchObject({
            labelDetails: { detail: "() as xs:boolean" },
            detail: expect.stringContaining("fn:true() as xs:boolean"),
        });
        expect(items.find((item) => item.label === "fn:concat")?.detail).toMatch(
            /^fn:concat\(.+\) as /,
        );
        // No item from a different namespace should appear
        expect(labels(items).every((label) => label.startsWith("fn:"))).toBe(true);
    });

    it("provides correct textEdit range when typing 'fn:'", async () => {
        const document = testDocument("completion-fn-prefix-textedit", "fn:");
        const items = await findCompletions(
            document,
            document.positionAt(3),
            parserService,
            workspaceService,
            wrapperClient,
        );

        const stringJoin = items.find((item) => item.label === "fn:string-join");
        expect(stringJoin).toBeDefined();
        // textEdit must replace the typed prefix `fn:` (3 chars) ending at the cursor
        expect(stringJoin?.textEdit).toMatchObject({
            range: {
                start: { line: 0, character: 0 },
                end: { line: 0, character: 3 },
            },
        });
    });

    it("suggests builtin functions when typing 'fn:' after an operator", async () => {
        const document = testDocument("completion-fn-prefix-expr", "1 + fn:");
        const items = await findCompletions(
            document,
            document.positionAt("1 + fn:".length),
            parserService,
            workspaceService,
            wrapperClient,
        );

        expect(labels(items)).toContain("fn:string-join");
        expect(labels(items)).toContain("fn:concat");
    });

    it.each(["*", "*:", "*:FOAR", "err:*"])(
        "keeps suggesting while typing the wildcard %s",
        async (target) => {
            const source = `try { 1 } catch ${target}`;
            const document = testDocument(
                `completion-catch-wildcard-${encodeURIComponent(target)}`,
                source,
            );
            const items = await findCompletions(
                document,
                document.positionAt(source.length),
                parserService,
                workspaceService,
                wrapperClient,
            );

            expect(items.length).toBeGreaterThan(0);
            expect(items.every((item) => item.label.startsWith(target))).toBe(true);
        },
    );

    it("does not suggest error codes after a variable named catch", async () => {
        const source = "let $catch := 1 return $catch ";
        const document = testDocument("completion-variable-named-catch", source);
        const items = await findCompletions(
            document,
            document.positionAt(source.length),
            parserService,
            workspaceService,
            wrapperClient,
        );

        expect(items.map((item) => item.label)).not.toContain("err:*");
    });

    it("does not allow functions after a prefix in a catch target", () => {
        const source = "try { 1 div 0 } catch err:";
        const document = testDocument("completion-catch-prefix-intent", source);
        const intent = parserService.collectCompletionIntent(document, source.length);

        expect(intent?.allowErrorCodeTargets).toBe(true);
        expect(intent?.allowFunctions).toBe(false);
    });

    it.each([
        "(: note",
        "(: note ",
        "(:",
        "1 + (: note",
        "(: a (: b :) c",
        '"open ',
        "'open ",
        '1 + "open string ',
    ])("offers nothing inside the unterminated %s", (source) => {
        for (const extension of ["jq", "xq"]) {
            const document = testDocumentFromUri(source, {
                uri: `file:///completion-unterminated-${encodeURIComponent(source)}.${extension}`,
            });
            expect(parserService.collectCompletionIntent(document, source.length)).toBeNull();
        }
    });

    it.each(['"(: a" + ', "(: a :) ", "(", '"a" ', "1 (: a :) + "])(
        "still offers items after %s",
        (source) => {
            const document = testDocument(`completion-after-${encodeURIComponent(source)}`, source);
            expect(parserService.collectCompletionIntent(document, source.length)).not.toBeNull();
        },
    );

    it("suggests builtin functions when typing a keyword prefix like 'array:' in 'let $a := array:'", async () => {
        const document = testDocument("completion-array-prefix-expr", "let $a := array:");
        const items = await findCompletions(
            document,
            document.positionAt("let $a := array:".length),
            parserService,
            workspaceService,
            wrapperClient,
        );

        expect(labels(items)).toContain("array:size");
        expect(labels(items)).toContain("array:get");
        expect(labels(items).every((label) => label.startsWith("array:"))).toBe(true);
    });

    it("suggests builtin types when typing 'xs:' in a type annotation context", async () => {
        const document = testDocument("completion-xs-type-prefix", "declare variable $x as xs:");
        const position = document.positionAt("declare variable $x as xs:".length);
        const items = await findCompletions(
            document,
            position,
            parserService,
            workspaceService,
            wrapperClient,
        );

        expect(labels(items)).toContain("xs:string");
        expect(labels(items)).toContain("xs:integer");
        // Should not suggest functions in a type context
        expect(labels(items).some((label) => label.startsWith("fn:"))).toBe(false);
    });

    it("replaces a bare function name typed so far", async () => {
        const document = testDocument("completion-bare-name", "concat");
        const items = await findCompletions(
            document,
            document.positionAt("concat".length),
            parserService,
            workspaceService,
            wrapperClient,
        );

        expect(items.length).toBeGreaterThan(0);
        for (const item of items) {
            expect((item.textEdit as TextEdit).range).toEqual({
                start: { line: 0, character: 0 },
                end: { line: 0, character: "concat".length },
            });
        }
    });
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

    it("suggests builtin functions when typing 'fn:' in XQuery", async () => {
        const document = testDocumentFromUri("fn:", {
            uri: "file:///completion-fn-xquery.xq",
            languageId: "xquery",
        });
        const items = await findCompletions(
            document,
            document.positionAt(3),
            parserService,
            workspaceService,
            wrapperClient,
        );

        expect(labels(items)).toContain("fn:string-join");
        expect(labels(items)).toContain("fn:concat");
        expect(labels(items).every((label) => label.startsWith("fn:"))).toBe(true);
    });
});

describe.each(["jsoniq", "xquery"])("%s binding completion scope", (languageId) => {
    it.each([
        ["let $i := 1\nlet $a := $i|, $b := $a\nreturn $b", ["$i"]],
        ["for $i in 1 to 10\nfor $a at $pos in $i|, $b in $a\nreturn $b", ["$i"]],
        ["let $a := 1, $b := $a|\nreturn $b", ["$a"]],
        ["some $a in 1 to 10, $b in $a| satisfies $b eq 1", ["$a"]],
    ] as const)(
        "keeps a binding hidden just before its delimiter in '%s'",
        async (markedSource, expected) => {
            const offset = markedSource.indexOf("|");
            const source = markedSource.replace("|", "");
            const document = testDocumentFromUri(source, {
                uri: `file:///completion-binding-delimiter-${encodeURIComponent(markedSource)}.${languageId}`,
                languageId,
            });
            const items = await findCompletions(
                document,
                document.positionAt(offset),
                parserService,
                workspaceService,
                wrapperClient,
            );

            expect(
                items
                    .filter((item) => item.kind === CompletionItemKind.Variable)
                    .map((item) => item.label)
                    .sort(),
            ).toEqual([...expected].sort());
        },
    );

    it.each([
        ["let $a := $", []],
        ["for $a in $", []],
        ["for $a at $pos in $", []],
        ["for $i in 1 to 10\nlet $a := $", ["$i"]],
        ["for $i in 1 to 10\nfor $a at $pos in $", ["$i"]],
        ["let $a := 1, $b := $", ["$a"]],
        ["for $a at $pos in 1 to 10, $b at $other in $", ["$a", "$pos"]],
        ["let $a := 1\nlet $a := $", ["$a"]],
        ["some $a in $", []],
        ["some $a in 1 to 10, $b in $", ["$a"]],
        ["some $a in 1 to 10 satisfies $", ["$a"]],
        ["every $a in 1 to 10, $b in $", ["$a"]],
        ["(some $a in 1 satisfies $a eq 1), $", []],
        ["(every $a in 1 satisfies $a eq 1), $", []],
    ] as const)("offers only variables already in scope in '%s'", async (source, expected) => {
        const document = testDocumentFromUri(source, {
            uri: `file:///completion-binding-${encodeURIComponent(source)}.${languageId}`,
            languageId,
        });
        const items = await findCompletions(
            document,
            document.positionAt(source.length),
            parserService,
            workspaceService,
            wrapperClient,
        );

        expect(
            items
                .filter((item) => item.kind === CompletionItemKind.Variable)
                .map((item) => item.label)
                .sort(),
        ).toEqual([...expected].sort());
    });

    it.each(["$", "$i", "$i + $", "$i, $other := $"])(
        "keeps grouping variables out of an initializer ending in '%s'",
        async (initializer) => {
            const source = `for $i in 1 to 10\ngroup by $mod := ${initializer}`;
            const document = testDocumentFromUri(source, {
                uri: `file:///completion-group-initializer-${encodeURIComponent(initializer)}.${languageId}`,
                languageId,
            });

            const labelsAtCursor = await completionLabels(
                document,
                document.positionAt(source.length),
            );

            expect(labelsAtCursor).toContain("$i");
            expect(labelsAtCursor).not.toContain("$mod");
            expect(labelsAtCursor).not.toContain("$other");
        },
    );

    it.each(["return $", "where $", "let $next := $"])(
        "makes grouping variables available in '%s'",
        async (followingClause) => {
            const source = `for $i in 1 to 10\ngroup by $mod := $i mod 2, $other := $i mod 3\n${followingClause}`;
            const document = testDocumentFromUri(source, {
                uri: `file:///completion-after-group-${encodeURIComponent(followingClause)}.${languageId}`,
                languageId,
            });

            const labelsAtCursor = await completionLabels(
                document,
                document.positionAt(source.length),
            );

            expect(labelsAtCursor).toContain("$i");
            expect(labelsAtCursor).toContain("$mod");
            expect(labelsAtCursor).toContain("$other");
        },
    );
});

/** The text after accepting the item with the label at the offset. */
async function acceptItem(document: TextDocument, offset: number, label: string): Promise<string> {
    const items = await findCompletions(
        document,
        document.positionAt(offset),
        parserService,
        workspaceService,
        wrapperClient,
    );
    const edit = items.find((item) => item.label === label)?.textEdit as TextEdit;
    return TextDocument.applyEdits(document, [edit]);
}

function labels(items: CompletionItem[]): string[] {
    return items.map((item) => item.label);
}

async function completionLabels(document: TextDocument, position: Position): Promise<string[]> {
    return labels(
        await findCompletions(document, position, parserService, workspaceService, wrapperClient),
    );
}
