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

    it("keeps a chain on one line after a comment on its own line", () => {
        expectLayout(
            ["(: header :)", "(1 to 10) ! string()"],
            ["(: header :)", "(1 to 10) ! string()"],
            languageId,
        );
    });
});
