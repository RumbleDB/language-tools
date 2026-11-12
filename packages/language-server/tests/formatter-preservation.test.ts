import { Token } from "antlr4ng";
import { formatParsedDocument } from "server/formatter/index.js";
import { getParserAdapterForDocument } from "server/parser/registry.js";
import { describe, expect, it } from "vitest";

import { parserService } from "./services.js";
import { testDocumentFromUri } from "./test-utils.js";

type Language = "jsoniq" | "xquery";

let documentId = 0;

function parse(source: string, languageId: Language) {
    documentId += 1;
    const document = testDocumentFromUri(source, {
        uri: `file:///preservation-${documentId}.${languageId === "xquery" ? "xq" : "jq"}`,
        languageId,
    });
    return {
        parsed: parserService.parse(document),
        parserId: getParserAdapterForDocument(document)!.id,
    };
}

function format(source: string, languageId: Language): string | undefined {
    const { parsed, parserId } = parse(source, languageId);
    expect(parsed.diagnostics).toEqual([]);
    return formatParsedDocument(parsed, parserId);
}

/** The text of the tokens that the parser reads, which formatting must not change. */
function tokenTexts(source: string, languageId: Language): string[] {
    const { parsed } = parse(source, languageId);
    expect(parsed.diagnostics).toEqual([]);
    return parsed.tokenStream
        .getTokens()
        .filter((token) => token.channel === Token.DEFAULT_CHANNEL && token.type !== Token.EOF)
        .map((token) => token.text ?? "");
}

function commentTexts(source: string): string[] {
    return source.match(/\(:[\s\S]*?:\)/g) ?? [];
}

/** Formats the source and checks that only whitespace changes, and that formatting again changes nothing. */
function formatPreserving(source: string, languageId: Language): string {
    const formatted = format(source, languageId);
    expect(formatted).toBeDefined();
    expect(tokenTexts(formatted!, languageId)).toEqual(tokenTexts(source, languageId));
    expect(commentTexts(formatted!)).toEqual(commentTexts(source));
    expect(format(formatted!, languageId)).toBe(formatted);
    return formatted!;
}

const BOTH: Language[] = ["jsoniq", "xquery"];

describe("Formatting keeps every token and comment", () => {
    describe.each(BOTH)("%s", (languageId) => {
        it("keeps a comment after a comma in a parenthesized sequence", () => {
            expect(formatPreserving("(1, (: one :)\n2)", languageId)).toContain("(: one :)");
        });

        it("keeps a comment that ends each line of a sequence", () => {
            formatPreserving(
                [
                    "let $x := 1",
                    "return (",
                    "  $x + 1,   (: first :)",
                    "  $x + 2,   (: second :)",
                    "  $x + 3",
                    ")",
                ].join("\n"),
                languageId,
            );
        });

        it("keeps the collation of a group by variable", () => {
            formatPreserving(
                'for $i in (1, 2) group by $j := $i collation "http://www.w3.org/2005/xpath-functions/collation/codepoint" return $j',
                languageId,
            );
        });

        it("keeps the default value of an external variable", () => {
            expect(formatPreserving('declare variable $x external := "foo";\n$x', languageId)).toBe(
                'declare variable $x external := "foo";\n\n$x\n',
            );
            formatPreserving('declare variable $x as xs:string external := "foo";\n$x', languageId);
        });

        it("starts a comment that was on its own line on its own line", () => {
            const formatted = formatPreserving(
                "let $x := 1\nreturn\n(: the value :)\n$x + 1",
                languageId,
            );
            expect(formatted).toContain("\n(: the value :)\n");
        });
    });

    describe("jsoniq", () => {
        it("keeps a comment after a comma in a merging object constructor", () => {
            formatPreserving('{| { "a": 1 }, (: a :)\n{ "b": 2 } |}', "jsoniq");
        });

        it.each([
            "() instance of ()",
            "3 treat as ()",
            "typeswitch (()) case () return 1 default return 2",
            "declare function local:f() as () { () };\nlocal:f()",
        ])("keeps the empty sequence type () in %s", (source) => {
            expect(formatPreserving(source, "jsoniq")).toContain("()");
        });

        it("keeps the keyword of a map constructor", () => {
            expect(formatPreserving('map { "a": 1 }', "jsoniq")).toBe('map { "a": 1 }\n');
        });

        it("keeps the comments of every case of a switch statement", () => {
            formatPreserving(
                [
                    "variable $res := 0;",
                    "switch (1)",
                    "case (: one :) 1 case (: two :) 2 return $res := 1;",
                    "default return $res := 2;",
                    "$res",
                ].join("\n"),
                "jsoniq",
            );
        });
    });

    describe.each(BOTH)("%s XML constructors", (languageId) => {
        it.each(['<a (: c :) b="1"/>', '<a b="1" (: c :)/>', "<a>{ 1 }</a (: c :)>"])(
            "keeps a comment inside the tags of %s",
            (source) => {
                expect(formatPreserving(source, languageId)).toBe(`${source}\n`);
            },
        );

        // The lexer reads `(: … :)` in the content of an element or an attribute as a comment, which the content
        // prints as written. The tokens around it must not print it a second time.
        it.each([
            "<a>(: c :)</a>",
            "<a>{ 1 }(: c :)</a>",
            '<a b="(: c :){ 1 }"/>',
            '<a b="{ 1 }(: c :)"/>',
        ])("prints a comment in the content of %s once", (source) => {
            expect(formatPreserving(source, languageId)).toBe(`${source}\n`);
        });
    });
});
