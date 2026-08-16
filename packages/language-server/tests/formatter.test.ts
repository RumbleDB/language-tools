import { formatParsedDocument } from "server/formatter/index.js";
import { getParserAdapterForDocument } from "server/parser/registry.js";
import { describe, expect, it } from "vitest";

import { parserService } from "./services.js";
import { testDocument, testDocumentFromUri } from "./test-utils.js";

const TEST_FORMATTER_OPTIONS = {
    indentSize: 4,
    useTabs: false,
} as const;

let docId = 0;
function formatText(
    source: string | string[],
    languageId: "jsoniq" | "xquery" = "jsoniq",
    options?: Parameters<typeof formatParsedDocument>[2],
): string {
    docId += 1;
    const ext = languageId === "xquery" ? "xq" : "jq";
    const doc = testDocumentFromUri(source, {
        uri: `file:///test-document-${docId}.${ext}`,
        languageId,
    });
    const parserId = getParserAdapterForDocument(doc)!.id;
    return (
        formatParsedDocument(parserService.parse(doc), parserId, {
            ...TEST_FORMATTER_OPTIONS,
            ...options,
        }) ?? doc.getText()
    );
}

function semanticAst(value: unknown): unknown {
    return JSON.parse(
        JSON.stringify(value, (key, nestedValue: unknown) =>
            key === "range" || key === "selectionRange" || key === "visibleFrom"
                ? undefined
                : nestedValue,
        ),
    );
}

function expectFormattingInvariant(source: string, languageId: "jsoniq" | "xquery"): void {
    const original = testDocumentFromUri(source, {
        uri: `file:///invariant-original-${docId}.${languageId === "xquery" ? "xq" : "jq"}`,
        languageId,
    });
    const originalParse = parserService.parse(original);
    expect(originalParse.diagnostics).toEqual([]);

    const formatted = formatText(source, languageId);
    const result = testDocumentFromUri(formatted, {
        uri: `file:///invariant-formatted-${docId}.${languageId === "xquery" ? "xq" : "jq"}`,
        languageId,
    });
    const formattedParse = parserService.parse(result);
    expect(formattedParse.diagnostics).toEqual([]);
    expect(semanticAst(formattedParse.ast)).toEqual(semanticAst(originalParse.ast));
    expect(formatText(formatted, languageId)).toBe(formatted);
}

describe("JSONiq & XQuery Formatter", () => {
    describe("Formatter options", () => {
        it.each(["jsoniq", "xquery"] as const)(
            "uses the requested %s indentation size",
            (languageId) => {
                expect(formatText(`<root><child/></root>`, languageId, { indentSize: 2 })).toBe(
                    ["<root>", "  <child/>", "</root>", ""].join("\n"),
                );
            },
        );

        it("can keep related and unrelated prolog declarations adjacent", () => {
            const input = "declare variable $a := 1; declare function local:f() { $a }; local:f()";
            expect(formatText(input, "jsoniq", { blankLineBetweenDeclarations: false })).toBe(
                "declare variable $a := 1;\ndeclare function local:f() { $a };\n\nlocal:f()\n",
            );
        });

        it("can omit the final newline", () => {
            expect(formatText("[1,2]", "jsoniq", { insertFinalNewline: false })).toBe("[ 1, 2 ]");
        });

        it.each(["jsoniq", "xquery"] as const)(
            "uses tabs for requested %s indentation",
            (languageId) => {
                expect(formatText(`<root><child/></root>`, languageId, { useTabs: true })).toBe(
                    ["<root>", "\t<child/>", "</root>", ""].join("\n"),
                );
            },
        );
    });

    describe("String literals", () => {
        it.each(["jsoniq", "xquery"] as const)(
            "preserves whitespace inside %s string literals",
            (languageId) => {
                const input = `["hello  world", ' padded value ', "tab\tseparated"]`;

                expect(formatText(input, languageId)).toBe(
                    `[ "hello  world", ' padded value ', "tab\tseparated" ]\n`,
                );
            },
        );
    });

    describe("Direct XML constructors", () => {
        it.each(["jsoniq", "xquery"] as const)(
            "formats %s XML markup and expressions while preserving text content",
            (languageId) => {
                const input = `<root id="primary"><child>{1+2}</child><!-- note --><![CDATA[ raw ]]></root>`;

                expect(formatText(input, languageId)).toBe(
                    `<root id="primary"><child>{ 1 + 2 }</child><!-- note --><![CDATA[ raw ]]></root>\n`,
                );
            },
        );

        it.each(["jsoniq", "xquery"] as const)(
            "normalizes %s direct-tag attribute separators",
            (languageId) => {
                const input = `<book isbn = "123" language = "en"><title>Example</title></book>`;

                expect(formatText(input, languageId)).toBe(
                    [
                        '<book isbn="123" language="en">',
                        "    <title>Example</title>",
                        "</book>",
                        "",
                    ].join("\n"),
                );
            },
        );

        it.each(["jsoniq", "xquery"] as const)(
            "wraps long %s direct-tag attributes and reflows element-only content",
            (languageId) => {
                const input = `<book isbn = "978-0123456789" language = "en" edition = "first"><title>Example</title></book>`;

                expect(formatText(input, languageId, { maxLineWidth: 30 })).toBe(
                    [
                        "<book",
                        '    isbn="978-0123456789"',
                        '    language="en"',
                        '    edition="first"',
                        ">",
                        "    <title>Example</title>",
                        "</book>",
                        "",
                    ].join("\n"),
                );
            },
        );

        it.each(["jsoniq", "xquery"] as const)("wraps long %s self-closing tags", (languageId) => {
            const input = `<image src = "cover.png" alt = "Cover art" width = "800"/>`;

            expect(formatText(input, languageId, { maxLineWidth: 24 })).toBe(
                [
                    "<image",
                    '    src="cover.png"',
                    '    alt="Cover art"',
                    '    width="800"',
                    "/>",
                    "",
                ].join("\n"),
            );
        });

        it.each(["jsoniq", "xquery"] as const)(
            "indents %s element-only content under the strip policy",
            (languageId) => {
                const input = `<root><child id = "one"/><child id = "two"/></root>`;

                expect(formatText(input, languageId)).toBe(
                    [
                        "<root>",
                        '    <child id="one"/>',
                        '    <child id="two"/>',
                        "</root>",
                        "",
                    ].join("\n"),
                );
            },
        );

        it.each(["jsoniq", "xquery"] as const)(
            "indents %s enclosed expressions with structural content under strip",
            (languageId) => {
                const input = `<root> { $items } <child/> </root>`;

                expect(formatText(input, languageId)).toBe(
                    ["<root>", "    { $items }", "    <child/>", "</root>", ""].join("\n"),
                );
            },
        );

        it.each(["jsoniq", "xquery"] as const)(
            "keeps fitting %s enclosed expressions flat under strip",
            (languageId) => {
                const input = `<root>{ $first }{ $second }</root>`;

                expect(formatText(input, languageId)).toBe(`<root>{ $first }{ $second }</root>\n`);
            },
        );

        it.each(["jsoniq", "xquery"] as const)(
            "breaks long %s enclosed-expression bodies under strip",
            (languageId) => {
                const input = `<root>{ $first }{ $second }</root>`;

                expect(formatText(input, languageId, { maxLineWidth: 20 })).toBe(
                    ["<root>", "    { $first }", "    { $second }", "</root>", ""].join("\n"),
                );
            },
        );

        it.each(["jsoniq", "xquery"] as const)(
            "preserves %s boundary whitespace while formatting nested tags",
            (languageId) => {
                const input = [
                    "declare boundary-space preserve;",
                    "<root>",
                    '  <child id = "one"/>',
                    "</root>",
                ].join("\n");

                expect(formatText(input, languageId)).toBe(
                    [
                        "declare boundary-space preserve;",
                        "",
                        "<root>",
                        '  <child id="one"/>',
                        "</root>",
                        "",
                    ].join("\n"),
                );
            },
        );

        it.each(["jsoniq", "xquery"] as const)(
            "preserves %s boundary whitespace around enclosed expressions",
            (languageId) => {
                const input = [
                    "declare boundary-space preserve;",
                    "<root>  { $items }  <child/>  </root>",
                ].join("\n");

                expect(formatText(input, languageId)).toBe(
                    [
                        "declare boundary-space preserve;",
                        "",
                        "<root>  { $items }  <child/>  </root>",
                        "",
                    ].join("\n"),
                );
            },
        );

        it.each(["jsoniq", "xquery"] as const)("preserves %s mixed text content", (languageId) => {
            const input = `<paragraph>Hello <em>world</em>!</paragraph>`;

            expect(formatText(input, languageId)).toBe(`${input}\n`);
        });

        it.each(["jsoniq", "xquery"] as const)(
            "does not special-case %s xml:space",
            (languageId) => {
                const input = `<root xml:space="preserve"><child id = "one"/></root>`;

                expect(formatText(input, languageId)).toBe(
                    ['<root xml:space="preserve">', '    <child id="one"/>', "</root>", ""].join(
                        "\n",
                    ),
                );
            },
        );

        it.each(["jsoniq", "xquery"] as const)(
            "formats %s enclosed expressions without changing mixed text spacing",
            (languageId) => {
                const input = `<paragraph>Hello <em>{1+2}</em>!</paragraph>`;

                expect(formatText(input, languageId)).toBe(
                    `<paragraph>Hello <em>{ 1 + 2 }</em>!</paragraph>\n`,
                );
            },
        );

        it.each(["jsoniq", "xquery"] as const)(
            "formats %s enclosed expressions inside attribute values",
            (languageId) => {
                const input = `<item label="item-{1+2}" data='{ $x+1 }'/>`;

                expect(formatText(input, languageId)).toBe(
                    `<item label="item-{ 1 + 2 }" data='{ $x + 1 }'/>\n`,
                );
            },
        );

        it.each(["jsoniq", "xquery"] as const)(
            "formats every %s enclosed expression in an attribute value",
            (languageId) => {
                const input = `<item label="before-{1+2}-after-{3+4}"/>`;

                expect(formatText(input, languageId)).toBe(
                    `<item label="before-{ 1 + 2 }-after-{ 3 + 4 }"/>\n`,
                );
            },
        );

        it.each(["jsoniq", "xquery"] as const)(
            "preserves %s entities and escaped braces around formatted expressions",
            (languageId) => {
                const input = `<root>&amp;{{literal}}{1+2}</root>`;

                expect(formatText(input, languageId)).toBe(
                    `<root>&amp;{{literal}}{ 1 + 2 }</root>\n`,
                );
            },
        );

        it.each(["jsoniq", "xquery"] as const)(
            "keeps %s CDATA verbatim while formatting nested markup",
            (languageId) => {
                const input = `<root><child id = "one"/><![CDATA[ x < y ]]></root>`;

                expect(formatText(input, languageId)).toBe(
                    `<root><child id="one"/><![CDATA[ x < y ]]></root>\n`,
                );
            },
        );

        it.each(["jsoniq", "xquery"] as const)(
            "indents %s direct comments and processing instructions under strip",
            (languageId) => {
                const input = `<root><child/><!-- note --><?notice keep this?></root>`;

                expect(formatText(input, languageId)).toBe(
                    [
                        "<root>",
                        "    <child/>",
                        "    <!-- note -->",
                        "    <?notice keep this?>",
                        "</root>",
                        "",
                    ].join("\n"),
                );
            },
        );

        it.each(["jsoniq", "xquery"] as const)(
            "breaks long %s XML expressions without changing surrounding text",
            (languageId) => {
                const input = `<message>Result: {format-message("a very long value", "another long value")}</message>`;

                expect(formatText(input, languageId, { maxLineWidth: 30 })).toBe(
                    [
                        "<message>Result: {",
                        "    format-message(",
                        '        "a very long value",',
                        '        "another long value"',
                        "    )",
                        "}</message>",
                        "",
                    ].join("\n"),
                );
            },
        );

        it.each(["jsoniq", "xquery"] as const)(
            "breaks long %s attribute expressions without changing literal attribute text",
            (languageId) => {
                const input = `<item label='prefix-{format-message("a very long value", "another long value")}-suffix'/>`;

                expect(formatText(input, languageId, { maxLineWidth: 30 })).toBe(
                    [
                        "<item",
                        "    label='prefix-{",
                        "        format-message(",
                        '            "a very long value",',
                        '            "another long value"',
                        "        )",
                        "    }-suffix'",
                        "/>",
                        "",
                    ].join("\n"),
                );
            },
        );

        it.each(["jsoniq", "xquery"] as const)(
            "preserves multiline %s direct comment and PI contents",
            (languageId) => {
                const input = [
                    "declare boundary-space preserve;",
                    "<root><!-- first line",
                    "  second line --><?notice first line",
                    "  second line?></root>",
                ].join("\n");

                expect(formatText(input, languageId)).toBe(
                    [
                        "declare boundary-space preserve;",
                        "",
                        "<root><!-- first line",
                        "  second line --><?notice first line",
                        "  second line?></root>",
                        "",
                    ].join("\n"),
                );
            },
        );

        it.each(["jsoniq", "xquery"] as const)(
            "is idempotent for %s XML formatting",
            (languageId) => {
                const input = [
                    "declare boundary-space preserve;",
                    '<root label="item-{1+2}">',
                    '  <child id = "one">Value: {format-message("first", "second")}</child>',
                    "  <![CDATA[ x < y ]]>",
                    "</root>",
                ].join("\n");

                const once = formatText(input, languageId, { maxLineWidth: 30 });
                expect(formatText(once, languageId, { maxLineWidth: 30 })).toBe(once);
            },
        );
    });

    describe("Sequence item spacing", () => {
        it("adds spaces after commas in sequence expressions: (1,2,3) -> (1, 2, 3)", () => {
            const formatted = formatText("(1,2,3)");
            expect(formatted).toBe("(1, 2, 3)\n");
        });

        it("adds spaces after commas in function arguments: foo(1,2,3)", () => {
            const formatted = formatText("foo(1,2,3)");
            expect(formatted).toBe("foo(1, 2, 3)\n");
        });

        it("adds spaces after commas in array constructors: [1,2,3]", () => {
            const formatted = formatText("[1,2,3]");
            expect(formatted).toBe("[ 1, 2, 3 ]\n");
        });

        it("keeps a fitting square array on one line", () => {
            const formatted = formatText("[1,2,3,4]");
            expect(formatted).toBe("[ 1, 2, 3, 4 ]\n");
        });

        it("keeps a fitting array flat after an own-line leading comment", () => {
            const input = [
                '(:JIQS: ShouldCrash; ErrorCode="XPTY0004"; ErrorMetadata="LINE:2:COLUMN:0:" :)',
                "[",
                "    1,",
                "    2,",
                "    3,",
                "    4",
                "]",
            ].join("\n");

            expect(formatText(input)).toBe(
                '(:JIQS: ShouldCrash; ErrorCode="XPTY0004"; ErrorMetadata="LINE:2:COLUMN:0:" :)\n' +
                    "[ 1, 2, 3, 4 ]\n",
            );
        });

        it("applies the same leading-comment layout to XQuery arrays", () => {
            const input = ["(: Header comment :)", "[1, 2, 3, 4]"].join("\n");

            expect(formatText(input, "xquery")).toBe("(: Header comment :)\n[ 1, 2, 3, 4 ]\n");
        });

        it("keeps a fitting object flat after an own-line leading comment", () => {
            const input = ["(: Header comment :)", '{ "answer": 42 }'].join("\n");

            expect(formatText(input)).toBe('(: Header comment :)\n{ "answer": 42 }\n');
        });
    });

    describe("Blank line management", () => {
        it("removes extra blank lines (collapses multiple blank lines into one)", () => {
            const input = ["let $a := 1", "", "", "", "return $a"];
            const formatted = formatText(input);
            expect(formatted).not.toContain("\n\n\n");
        });

        it("adds a blank line between top-level prolog declarations", () => {
            const input = [
                "declare variable $a := 1;",
                "declare function local:foo($x) { $x + 1 };",
            ];
            const formatted = formatText(input);
            expect(formatted).toBe(
                "declare variable $a := 1;\n\ndeclare function local:foo($x) { $x + 1 };\n",
            );
        });

        it("groups annotated declarations by their grammar production", () => {
            const input = [
                "declare function local:first() { 1 };",
                "(: documentation :)",
                "declare %private function local:second() { 2 };",
                "local:second()",
            ].join("\n");

            expect(formatText(input)).toBe(
                [
                    "declare function local:first() { 1 };",
                    "(: documentation :)",
                    "declare %private function local:second() { 2 };",
                    "",
                    "local:second()",
                    "",
                ].join("\n"),
            );
        });

        it.each(["jsoniq", "xquery"] as const)(
            "does not normalize semantic whitespace in %s XML content",
            (languageId) => {
                const input = [
                    "declare boundary-space preserve;",
                    "<root>first  ",
                    "",
                    "",
                    "second</root>",
                ].join("\n");

                expect(formatText(input, languageId)).toBe(
                    [
                        "declare boundary-space preserve;",
                        "",
                        "<root>first  ",
                        "",
                        "",
                        "second</root>",
                        "",
                    ].join("\n"),
                );
            },
        );

        it.each(["jsoniq", "xquery"] as const)(
            "does not indent multiline semantic %s XML text inside a broken group",
            (languageId) => {
                const input = '[<root>first\n  second</root>, "a very long second array item"]';

                expect(formatText(input, languageId, { maxLineWidth: 20 })).toBe(
                    [
                        "[",
                        "    <root>first",
                        "  second</root>,",
                        '    "a very long second array item"',
                        "]",
                        "",
                    ].join("\n"),
                );
            },
        );
    });

    describe("FLWOR expressions", () => {
        it("formats FLWOR clauses on separate lines with return clause", () => {
            const input = "for $x in (1, 2, 3) let $y := $x * 2 where $y > 2 return $y";
            const formatted = formatText(input);
            expect(formatted).toBe(
                "for $x in (1, 2, 3)\nlet $y := $x * 2\nwhere $y > 2\nreturn $y\n",
            );
        });

        it("formats multiple variables in for and let clauses", () => {
            const input = "for $x in (1, 2), $y in (3, 4) return $x + $y";
            const formatted = formatText(input);
            expect(formatted).toBe("for $x in (1, 2), $y in (3, 4)\nreturn $x + $y\n");
        });
    });

    describe("Scripting statements", () => {
        it.each(["jsoniq", "xquery"] as const)(
            "formats %s statement sequences, assignments, loops, branches, and exits",
            (languageId) => {
                const input = [
                    "variable $x:=0;",
                    "while($x lt 3){$x:=$x+1;}",
                    "if($x eq 3)then{break loop;}else{continue loop;}",
                    "exit returning $x;",
                ].join("\n");

                expect(formatText(input, languageId)).toBe(
                    [
                        "variable $x := 0;",
                        "while ($x lt 3) {",
                        "    $x := $x + 1;",
                        "}",
                        "if ($x eq 3) then {",
                        "    break loop;",
                        "} else {",
                        "    continue loop;",
                        "}",
                        "exit returning $x;\n",
                    ].join("\n"),
                );
            },
        );

        it.each(["jsoniq", "xquery"] as const)(
            "formats %s FLWOR statements with a statement return branch",
            (languageId) => {
                const input = "for $x in (1,2) return $x := $x + 1;";

                expect(formatText(input, languageId)).toBe(
                    "for $x in (1, 2)\nreturn $x := $x + 1;\n",
                );
            },
        );

        it.each(["jsoniq", "xquery"] as const)(
            "formats %s switch, try/catch, and typeswitch statement forms",
            (languageId) => {
                const input = [
                    "switch($x)case 1 return break loop;default return continue loop;",
                    "try{$x:=1;}catch * {$x:=2;}",
                    "typeswitch($x)case $n as integer return break loop;default return continue loop;",
                ].join("\n");

                expect(formatText(input, languageId)).toBe(
                    [
                        "switch ($x)",
                        "    case 1 return break loop;",
                        "    default return continue loop;",
                        "try {",
                        "    $x := 1;",
                        "}",
                        "catch * {",
                        "    $x := 2;",
                        "}",
                        "typeswitch ($x)",
                        "    case $n as integer return break loop;",
                        "    default return continue loop;\n",
                    ].join("\n"),
                );
            },
        );
    });

    describe("If-Then-Else expressions", () => {
        it("formats short if-expressions on a single line", () => {
            const input = "if ($x > 0) then 1 else 0";
            const formatted = formatText(input);
            expect(formatted).toBe("if ($x > 0) then 1 else 0\n");
        });
    });

    describe("JSON & Object constructors", () => {
        it("formats JSONiq object constructors", () => {
            const input = '{"a": 1, "b": 2}';
            const formatted = formatText(input);
            expect(formatted).toBe('{ "a": 1, "b": 2 }\n');
        });

        it("formats XQuery map constructors with map keyword", () => {
            const input = 'map {"a": 1, "b": 2}';
            const formatted = formatText(input, "xquery");
            expect(formatted).toBe('map { "a": 1, "b": 2 }\n');
        });

        it("does not insert space before object lookup dot operator", () => {
            const input = 'let $a := { "a": 1 } .a return $a';
            const formatted = formatText(input, "jsoniq");
            expect(formatted).toBe('let $a := { "a": 1 }.a\nreturn $a\n');
        });

        it("does not insert space before array indexing predicate", () => {
            const input = "let $a := 1 return $a [1]";
            const formatted = formatText(input, "jsoniq");
            expect(formatted).toBe("let $a := 1\nreturn $a[1]\n");
        });

        it("correctly formats object merge constructors and object types without adding ?", () => {
            const input = [
                "declare function local:round($i as object) as object {",
                "  {|",
                '    remove-keys($i, ("features2", "rawPrediction", "probability")),',
                "    {",
                '      "features2" : [ for $v in $i.features2[] return float($v) ],',
                '      "rawPrediction" : [ for $v in $i.rawPrediction[] return float($v) ],',
                '      "probability" : [ for $v in $i.probability[] return float($v) ]',
                "    }",
                "  |}",
                "};",
            ];
            const formatted = formatText(input, "jsoniq");
            const expected = [
                "declare function local:round($i as object) as object {",
                "    {|",
                '        remove-keys($i, ("features2", "rawPrediction", "probability")),',
                "        {",
                '            "features2": [',
                "                for $v in $i.features2[]",
                "                return float($v)",
                "            ],",
                '            "rawPrediction": [',
                "                for $v in $i.rawPrediction[]",
                "                return float($v)",
                "            ],",
                '            "probability": [',
                "                for $v in $i.probability[]",
                "                return float($v)",
                "            ]",
                "        }",
                "    |}",
                "};\n",
            ].join("\n");
            expect(formatted).toBe(expected);
        });

        it("breaks array constructor across multiple lines when array elements contain multiline FLWOR clauses", () => {
            const input = [
                '{"features2": [ for $v in $i.features2[] where $v != true return float($v) ]}',
            ];
            const formatted = formatText(input, "jsoniq");
            const expected = [
                "{",
                '    "features2": [',
                "        for $v in $i.features2[]",
                "        where $v != true",
                "        return float($v)",
                "    ]",
                "}\n",
            ].join("\n");
            expect(formatted).toBe(expected);
        });

        it("indents opening brace of multi-element object sequence in parenthesized expression", () => {
            const input = [
                "let $training-data := ({",
                '    "id": 0,',
                '    "label": 1,',
                '    "col1": 0.0,',
                '    "col2": 1.1,',
                '    "col3": 0.1',
                "}, {",
                '    "id": 1,',
                '    "label": 0,',
                '    "col1": 2.0,',
                '    "col2": 1.0,',
                '    "col3": - 1.0',
                "})",
                "return $training-data",
            ].join("\n");
            const formatted = formatText(input, "jsoniq");
            const expected = [
                "let $training-data := (",
                "    {",
                '        "id": 0,',
                '        "label": 1,',
                '        "col1": 0.0,',
                '        "col2": 1.1,',
                '        "col3": 0.1',
                "    },",
                "    {",
                '        "id": 1,',
                '        "label": 0,',
                '        "col1": 2.0,',
                '        "col2": 1.0,',
                '        "col3": - 1.0',
                "    }",
                ")",
                "return $training-data\n",
            ].join("\n");
            expect(formatted).toBe(expected);
        });
    });

    describe("Grammar-specific differences", () => {
        it("formats JSONiq context item ($$)", () => {
            const input = "let $x := $$ return $x";
            const formatted = formatText(input, "jsoniq");
            expect(formatted).toBe("let $x := $$\nreturn $x\n");
        });

        it("formats XQuery context item (.)", () => {
            const input = "let $x := . return $x";
            const formatted = formatText(input, "xquery");
            expect(formatted).toBe("let $x := .\nreturn $x\n");
        });

        it("formats JSONiq version declaration", () => {
            const input = 'jsoniq version "1.0"; 1 + 1';
            const formatted = formatText(input, "jsoniq");
            expect(formatted).toBe('jsoniq version "1.0";\n\n1 + 1\n');
        });

        it("formats XQuery version declaration", () => {
            const input = 'xquery version "3.1"; 1 + 1';
            const formatted = formatText(input, "xquery");
            expect(formatted).toBe('xquery version "3.1";\n\n1 + 1\n');
        });
    });

    describe("Comment preservation", () => {
        it("preserves top-of-file comments, inline comments, and standalone comments in JSONiq", () => {
            const input = [
                "(: Top comment :)",
                "declare function local:test() {",
                "    (: Inside function comment :)",
                "    let $x := 1 (: inline comment :)",
                "    return $x",
                "};",
                "(: Trailing comment :)",
            ].join("\n");
            const formatted = formatText(input, "jsoniq");
            const expected = [
                "(: Top comment :)",
                "declare function local:test() {",
                "    (: Inside function comment :)",
                "    let $x := 1 (: inline comment :)",
                "    return $x",
                "};",
                "(: Trailing comment :)\n",
            ].join("\n");
            expect(formatted).toBe(expected);
        });

        it("preserves comments in XQuery", () => {
            const input = [
                "(: Header comment :)",
                'xquery version "3.1";',
                "(: Prolog comment :)",
                "declare variable $x := 42; (: var comment :)",
                "$x",
            ].join("\n");
            const formatted = formatText(input, "xquery");
            const expected = [
                "(: Header comment :)",
                'xquery version "3.1";',
                "",
                "(: Prolog comment :)",
                "declare variable $x := 42; (: var comment :)",
                "",
                "$x\n",
            ].join("\n");
            expect(formatted).toBe(expected);
        });

        it("preserves comments in FLWOR expressions, objects, arrays, and binary operations", () => {
            const input = [
                "for $x in (",
                "    (: inside array :)",
                "    1,",
                "    2",
                ")",
                "(: clause comment :)",
                "where $x > 0 (: condition comment :)",
                "return {",
                '    (: object comment :) "a": $x + (: binary comment :) 1',
                "}",
            ].join("\n");
            const formatted = formatText(input, "jsoniq");
            const expected = [
                "for $x in (",
                "    (: inside array :)",
                "    1,",
                "    2",
                ")",
                "(: clause comment :)",
                "where $x > 0 (: condition comment :)",
                "return {",
                "    (: object comment :)",
                '    "a": $x + (: binary comment :) 1',
                "}\n",
            ].join("\n");
            expect(formatted).toBe(expected);
        });

        it("preserves comments before let clause without moving them after the dollar sign", () => {
            const input = ["(: Before :)", "let $a := 1", "return $a"].join("\n");
            const formatted = formatText(input, "jsoniq");
            const expected = ["(: Before :)", "let $a := 1", "return $a\n"].join("\n");
            expect(formatted).toBe(expected);
        });

        it("preserves comments inside sequence expressions", () => {
            const input = ["let $a := (1 (:test:))", "return $a"].join("\n");
            const formatted = formatText(input, "jsoniq");
            const expected = ["let $a := (1 (:test:))", "return $a\n"].join("\n");
            expect(formatted).toBe(expected);
        });

        it.each(["jsoniq", "xquery"] as const)(
            "preserves comments before source commas in %s sequences",
            (languageId) => {
                const input = ["let $a := (1 (:test:), 2)", "return $a"].join("\n");
                const formatted = formatText(input, languageId);
                const expected = ["let $a := (1 (:test:), 2)", "return $a\n"].join("\n");
                expect(formatted).toBe(expected);
            },
        );
    });

    describe("Comment preservation — parenthesized expressions", () => {
        it("preserves comments before parenthesized expressions (JIQS-style header comments)", () => {
            const input = ['(:JIQS: ShouldRun; Output="false" :)', "(1 to 10) ! ($$ + $$)"].join(
                "\n",
            );
            const formatted = formatText(input, "jsoniq");
            const expected = [
                '(:JIQS: ShouldRun; Output="false" :)',
                "(1 to 10) ! ($$ + $$)\n",
            ].join("\n");
            expect(formatted).toBe(expected);
        });
    });

    describe("Parenthesized expression layout", () => {
        it("breaks multi-item sequence across lines when items together exceed maxLineWidth", () => {
            const input = [
                "for $i in parallelize(",
                "    (",
                '        { "commits": [ { "author": "Einstein" } ], "repo": "r2" },     { "commits": [ { "author": "Goedel" }, { "author": "Ramanujan" } ], "repo": "r1" }',
                "    )",
                ")",
                "return $i",
            ].join("\n");
            const formatted = formatText(input, "jsoniq");
            // Each object must be on its own line — the combined line would be > 100 chars
            expect(formatted).toContain(
                '{ "commits": [ { "author": "Einstein" } ], "repo": "r2" },\n',
            );
            expect(formatted).toContain(
                '{ "commits": [ { "author": "Goedel" }, { "author": "Ramanujan" } ], "repo": "r1" }',
            );
        });
    });

    describe("Context item ($$ / .) spacing", () => {
        it("preserves spaces around operators when using JSONiq context item ($$)", () => {
            const formatted = formatText("(1 to 5) ! ($$ + $$)", "jsoniq");
            expect(formatted).toBe("(1 to 5) ! ($$ + $$)\n");
        });

        it("preserves spaces around operators when using XQuery context item (.)", () => {
            const formatted = formatText("(1 to 5) ! (. + .)", "xquery");
            expect(formatted).toBe("(1 to 5) ! (. + .)\n");
        });
    });

    describe("Syntax error handling", () => {
        it("refuses to format documents with syntax errors", () => {
            const input = "declare function local:foo("; // Incomplete syntax
            const doc = testDocument("broken", input);
            expect(formatParsedDocument(parserService.parse(doc), "jsoniq")).toBeUndefined();
        });
    });

    describe("Semantic meaning preservation", () => {
        it("preserves AST structure before and after formatting for JSONiq", () => {
            const original = "declare function local:add($x, $y) { $x + $y }; local:add(1, 2)";
            const formatted = formatText(original, "jsoniq");

            const originalDoc = testDocument("orig", original);
            const formattedDoc = testDocument("fmt", formatted);

            const origAst = parserService.parse(originalDoc).ast;
            const fmtAst = parserService.parse(formattedDoc).ast;

            expect(fmtAst.kind).toBe(origAst.kind);
            expect(fmtAst.children.length).toBe(origAst.children.length);
        });

        it("preserves AST structure before and after formatting for XQuery", () => {
            const original =
                'xquery version "3.1"; declare function local:add($x, $y) { $x + $y }; local:add(1, 2)';
            const formatted = formatText(original, "xquery");

            const originalDoc = testDocumentFromUri(original, {
                uri: "file:///orig.xq",
                languageId: "xquery",
            });
            const formattedDoc = testDocumentFromUri(formatted, {
                uri: "file:///fmt.xq",
                languageId: "xquery",
            });

            const origAst = parserService.parse(originalDoc).ast;
            const fmtAst = parserService.parse(formattedDoc).ast;

            expect(fmtAst.kind).toBe(origAst.kind);
            expect(fmtAst.children.length).toBe(origAst.children.length);
        });
    });

    describe("Grammar-family coverage", () => {
        const sharedCases = [
            ["inline functions", "function($x as integer) as integer { $x + 1 }(1)"],
            ["quantified expressions", "some $x in (1,2) satisfies $x gt 1"],
            ["path and axis expressions", '/root/child::item[@id = "x"]'],
            [
                "type expressions",
                '(1 treat as integer, 1 instance of integer, "1" cast as integer)',
            ],
            ["computed constructors", 'element root { "text" }'],
            ["module imports", 'import module namespace local = "urn:local"; 1'],
            [
                "namespace declarations and setters",
                'declare boundary-space strip; declare namespace local = "urn:local"; 1',
            ],
            ["ordered expressions", "ordered { (3,2,1) }"],
            ["arrow and named function expressions", "(1,2,3) => count() + count#1((1,2))"],
            ["window clauses", "for tumbling window $w in (1,2,3) start $s when true() return $w"],
            ["updating expressions", "copy $x := $source modify append json 1 into $x return $x"],
        ] as const;

        it.each(["jsoniq", "xquery"] as const)(
            "preserves parse and AST invariants across shared %s grammar families",
            (languageId) => {
                for (const [, source] of sharedCases) {
                    expectFormattingInvariant(source, languageId);
                }
            },
        );

        it.each(["jsoniq", "xquery"] as const)(
            "preserves parse and AST invariants for %s scripting",
            (languageId) => {
                expectFormattingInvariant(
                    "variable $x := 0; while ($x lt 2) { $x := $x + 1; } $x",
                    languageId,
                );
            },
        );

        it("preserves parse and AST invariants for JSONiq string constructors", () => {
            expectFormattingInvariant("``[value: `{1 + 2}`]``", "jsoniq");
        });
    });

    describe("Idempotency", () => {
        it("formatting an already formatted JSONiq document produces identical output", () => {
            const input = "for $x in (1, 2, 3)\nreturn $x\n";
            const formattedOnce = formatText(input, "jsoniq");
            const formattedTwice = formatText(formattedOnce, "jsoniq");
            expect(formattedTwice).toBe(formattedOnce);
        });

        it("formatting an already formatted XQuery document produces identical output", () => {
            const input = 'xquery version "3.1";\n\nfor $x in (1, 2, 3)\nreturn $x\n';
            const formattedOnce = formatText(input, "xquery");
            const formattedTwice = formatText(formattedOnce, "xquery");
            expect(formattedTwice).toBe(formattedOnce);
        });
    });

    describe("Control flow expressions", () => {
        it("formats try-catch expressions with catch block on a new line", () => {
            const input = "try { 1 / 0 } catch * { 0 }";
            const formatted = formatText(input);
            expect(formatted).toBe("try { 1 / 0 }\ncatch * { 0 }\n");
        });

        it.each(["jsoniq", "xquery"] as const)(
            "preserves mixed %s catch targets in source order",
            (languageId) => {
                const input = "try { 1 } catch err:first | *:second | * { 0 }";

                expect(formatText(input, languageId)).toBe(
                    "try { 1 }\ncatch err:first | *:second | * { 0 }\n",
                );
            },
        );

        it("formats switch expressions with indented cases", () => {
            const input =
                'switch ($x) case 1 return "one" case 2 return "two" default return "other"';
            const formatted = formatText(input);
            expect(formatted).toBe(
                'switch ($x)\n    case 1 return "one"\n    case 2 return "two"\n    default return "other"\n',
            );
        });

        it("formats typeswitch expressions with indented cases", () => {
            const input =
                'typeswitch ($x) case $i as integer return "int" case $s as string return "str" default $d return "other"';
            const formatted = formatText(input);
            expect(formatted).toBe(
                'typeswitch ($x)\n    case $i as integer return "int"\n    case $s as string return "str"\n    default $d return "other"\n',
            );
        });

        it.each(["jsoniq", "xquery"] as const)(
            "preserves comments before source union bars in %s typeswitch cases",
            (languageId) => {
                const input =
                    "typeswitch ($x) case $value as string (: union :) | integer return $value default return 0";

                expect(formatText(input, languageId)).toBe(
                    [
                        "typeswitch ($x)",
                        "    case $value as string (: union :) | integer return $value",
                        "    default return 0",
                        "",
                    ].join("\n"),
                );
            },
        );

        it("preserves top-level header comments before typeswitch expressions", () => {
            const input = [
                '(:JIQS: ShouldRun; Output="([ 1, 2 ], 1, 2, 3)" :)',
                'typeswitch ( [ 1, 2 ] ) case string return "string" case $a as boolean+ | array* return ($a, 1, 2, 3) default return "default"',
                "(: multiple items returned  :)",
            ].join("\n");
            const formatted = formatText(input);
            expect(formatted).toContain('(:JIQS: ShouldRun; Output="([ 1, 2 ], 1, 2, 3)" :)');
            expect(formatted).toContain("(: multiple items returned  :)");
        });
    });
});
