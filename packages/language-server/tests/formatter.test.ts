import { formatDocument } from "server/formatter/index.js";
import { parseDocument } from "server/parser/index.js";
import { describe, expect, it } from "vitest";

import { testDocument, testDocumentFromUri } from "./test-utils.js";

let docId = 0;
function formatText(source: string | string[], languageId: "jsoniq" | "xquery" = "jsoniq"): string {
    docId += 1;
    const ext = languageId === "xquery" ? "xq" : "jq";
    const doc = testDocumentFromUri(source, {
        uri: `file:///test-document-${docId}.${ext}`,
        languageId,
    });
    const edits = formatDocument(doc);
    if (edits.length === 0) {
        return doc.getText();
    }
    return edits[0]!.newText;
}

describe("JSONiq & XQuery Formatter", () => {
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

    describe("JSONiq scripting statements", () => {
        it("formats statement sequences, assignments, loops, branches, and exits", () => {
            const input = [
                "variable $x:=0;",
                "while($x lt 3){$x:=$x+1;}",
                "if($x eq 3)then{break loop;}else{continue loop;}",
                "exit returning $x;",
            ].join("\n");

            expect(formatText(input)).toBe(
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
        });

        it("formats FLWOR statements with a statement return branch", () => {
            const input = "for $x in (1,2) return $x := $x + 1;";

            expect(formatText(input)).toBe("for $x in (1, 2)\nreturn $x := $x + 1;\n");
        });

        it("formats switch, try/catch, and typeswitch statement forms", () => {
            const input = [
                "switch($x)case 1 return break loop;default return continue loop;",
                "try{$x:=1;}catch * {$x:=2;}",
                "typeswitch($x)case $n as integer return break loop;default return continue loop;",
            ].join("\n");

            expect(formatText(input)).toBe(
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
        });
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

        it("preserves comments inside multi-item sequence expressions before commas", () => {
            const input = ["let $a := (1 (:test:), 2)", "return $a"].join("\n");
            const formatted = formatText(input, "jsoniq");
            const expected = ["let $a := (1 (:test:), 2)", "return $a\n"].join("\n");
            expect(formatted).toBe(expected);
        });
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
            const edits = formatDocument(doc);
            expect(edits).toHaveLength(0);
        });
    });

    describe("Semantic meaning preservation", () => {
        it("preserves AST structure before and after formatting for JSONiq", () => {
            const original = "declare function local:add($x, $y) { $x + $y }; local:add(1, 2)";
            const formatted = formatText(original, "jsoniq");

            const originalDoc = testDocument("orig", original);
            const formattedDoc = testDocument("fmt", formatted);

            const origAst = parseDocument(originalDoc).ast;
            const fmtAst = parseDocument(formattedDoc).ast;

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

            const origAst = parseDocument(originalDoc).ast;
            const fmtAst = parseDocument(formattedDoc).ast;

            expect(fmtAst.kind).toBe(origAst.kind);
            expect(fmtAst.children.length).toBe(origAst.children.length);
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
            const input = "try { 1 / 0 } catch ($e) { 0 }";
            const formatted = formatText(input);
            expect(formatted).toBe("try { 1 / 0 }\ncatch ($e) { 0 }\n");
        });

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
