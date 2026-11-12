import { formatParsedDocument } from "server/formatter/index.js";
import { getParserAdapterForDocument } from "server/parser/registry.js";
import { describe, expect, it } from "vitest";

import { parserService } from "./services.js";
import { testDocumentFromUri } from "./test-utils.js";

type Language = "jsoniq" | "xquery";

let documentId = 0;

function format(lines: string[], languageId: Language): string {
    documentId += 1;
    const document = testDocumentFromUri(lines.join("\n"), {
        uri: `file:///layout-${documentId}.${languageId === "xquery" ? "xq" : "jq"}`,
        languageId,
    });
    const parsed = parserService.parse(document);
    expect(parsed.diagnostics).toEqual([]);
    const formatted = formatParsedDocument(parsed, getParserAdapterForDocument(document)!.id);
    expect(formatted).toBeDefined();
    return formatted!;
}

/** Checks that formatting the lines gives the expected lines, and that formatting those changes nothing. */
function expectLayout(input: string[], expected: string[], languageId: Language): void {
    const output = expected.join("\n") + "\n";
    expect(format(input, languageId)).toBe(output);
    expect(format(expected, languageId)).toBe(output);
}

const BOTH: Language[] = ["jsoniq", "xquery"];

describe.each(BOTH)("%s layout", (languageId) => {
    describe("rules without a formatter of their own", () => {
        it.each([
            ['import module namespace m = "urn:m" at "m.jq";', "1"],
            ['declare namespace eg = "http://example.com";', "1"],
        ])("keeps the semicolon of %s", (declaration, body) => {
            expectLayout([declaration, body], [declaration, "", body], languageId);
        });

        it.each([
            "concat#2",
            "-1",
            '"a" => upper-case()',
            '"a"=>upper-case()',
            "function($x) { $x }",
        ])("keeps the spacing of %s", (expression) => {
            expectLayout([expression], [expression], languageId);
        });
    });

    describe("binary operators", () => {
        it("spaces each operator", () => {
            expectLayout(["1+2*3-4 div 2"], ["1 + 2 * 3 - 4 div 2"], languageId);
        });

        it("breaks a long chain before its operators, not inside a function call", () => {
            expectLayout(
                [
                    "let $a := math:pow(math:sin($dlat div 2), 2) + math:cos(math:radians($from)) * math:cos(math:radians($to)) * math:pow(math:sin($dlon div 2), 2)",
                    "return $a",
                ],
                [
                    "let $a := math:pow(math:sin($dlat div 2), 2)",
                    "    + math:cos(math:radians($from))",
                    "        * math:cos(math:radians($to))",
                    "        * math:pow(math:sin($dlon div 2), 2)",
                    "return $a",
                ],
                languageId,
            );
        });
    });

    describe("FLWOR expressions", () => {
        it("indents a FLWOR bound to a variable on its own lines", () => {
            expectLayout(
                ["let $a := for $x in (1, 2) return $x", "return $a"],
                ["let $a :=", "    for $x in (1, 2)", "    return $x", "return $a"],
                languageId,
            );
        });

        it("indents a FLWOR that is returned on its own lines", () => {
            expectLayout(
                ["for $x in (1, 2) return for $y in (3, 4) return $x * $y"],
                ["for $x in (1, 2)", "return", "    for $y in (3, 4)", "    return $x * $y"],
                languageId,
            );
        });

        it("indents a FLWOR that initializes a variable on its own lines", () => {
            expectLayout(
                ["declare variable $a := for $x in (1, 2) return $x;", "$a"],
                ["declare variable $a :=", "    for $x in (1, 2)", "    return $x;", "", "$a"],
                languageId,
            );
        });

        it("puts the conditions of a window on their own lines", () => {
            expectLayout(
                [
                    "for sliding window $w in (1, 2, 3) start at $s when true() only end at $e when $e - $s eq 2",
                    "return $w",
                ],
                [
                    "for sliding window $w in (1, 2, 3)",
                    "    start at $s when true()",
                    "    only end at $e when $e - $s eq 2",
                    "return $w",
                ],
                languageId,
            );
            expectLayout(
                ["for tumbling window $w in (1, 2, 3) start when true() return $w"],
                ["for tumbling window $w in (1, 2, 3)", "    start when true()", "return $w"],
                languageId,
            );
        });
    });

    describe("line breaks kept from the source", () => {
        it("keeps a function body on its own lines", () => {
            expectLayout(
                ["declare function local:f($x) {", "  $x + 1", "};", "local:f(1)"],
                ["declare function local:f($x) {", "    $x + 1", "};", "", "local:f(1)"],
                languageId,
            );
        });

        it("keeps a function body on the line of its signature", () => {
            expectLayout(
                ["declare function local:f($x) { $x + 1 };", "local:f(1)"],
                ["declare function local:f($x) { $x + 1 };", "", "local:f(1)"],
                languageId,
            );
        });
    });

    describe("blank lines", () => {
        it("keeps a blank line between declarations of the same kind", () => {
            expectLayout(
                [
                    "declare variable $a := 1;",
                    "",
                    "declare variable $b := 2;",
                    "declare variable $c := 3;",
                    "$a",
                ],
                [
                    "declare variable $a := 1;",
                    "",
                    "declare variable $b := 2;",
                    "declare variable $c := 3;",
                    "",
                    "$a",
                ],
                languageId,
            );
        });

        it("keeps the blank lines around a comment on its own line", () => {
            expectLayout(
                [
                    "(: header :)",
                    "",
                    "declare variable $a := 1;",
                    "(: about b :)",
                    "",
                    "declare variable $b := 2;",
                    "$a",
                ],
                [
                    "(: header :)",
                    "",
                    "declare variable $a := 1;",
                    "(: about b :)",
                    "",
                    "declare variable $b := 2;",
                    "",
                    "$a",
                ],
                languageId,
            );
            expectLayout(
                ["let $x := 1", "", "(: explain y :)", "let $y := 2", "return $x + $y"],
                ["let $x := 1", "", "(: explain y :)", "let $y := 2", "return $x + $y"],
                languageId,
            );
        });

        it("keeps at most one blank line", () => {
            expectLayout(["(: header :)", "", "", "", "1"], ["(: header :)", "", "1"], languageId);
        });
    });

    it("keeps a chain on one line after a comment on its own line", () => {
        expectLayout(
            ["(: header :)", "(1 to 10) ! string()"],
            ["(: header :)", "(1 to 10) ! string()"],
            languageId,
        );
    });
});

describe("jsoniq objects", () => {
    it("keeps an object with several fields on one line when it fits", () => {
        expectLayout(['{ "a": 1, "b": 2, "c": 3 }'], ['{ "a": 1, "b": 2, "c": 3 }'], "jsoniq");
    });

    it("keeps an object expanded when its source is", () => {
        expectLayout(
            ["{", '  "a": 1, "b": 2', "}"],
            ["{", '    "a": 1,', '    "b": 2', "}"],
            "jsoniq",
        );
    });

    it("keeps each object of a long sequence on one line", () => {
        expectLayout(
            [
                "declare variable $sales := (",
                '  { "day": 1, "shop": "Amsterdam", "revenue": 1210.50 },',
                '  { "day": 2, "shop": "Amsterdam", "revenue": 980.00, "promotion": "stroopwafel" }',
                ");",
                "$sales",
            ],
            [
                "declare variable $sales := (",
                '    { "day": 1, "shop": "Amsterdam", "revenue": 1210.50 },',
                '    { "day": 2, "shop": "Amsterdam", "revenue": 980.00, "promotion": "stroopwafel" }',
                ");",
                "",
                "$sales",
            ],
            "jsoniq",
        );
    });
});
