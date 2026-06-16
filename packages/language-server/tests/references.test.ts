import { findReferenceLocations } from "server/references.js";
import { describe, expect, it } from "vitest";

import { positionAt, positionAtNth, testDocument, testDocumentFromUri } from "./test-utils.js";

describe("JSONiq references", () => {
    it("finds references for a local variable without crossing shadowed scopes", () => {
        const source = [
            "declare variable $x := 10;",
            "declare function local:f($x) {",
            "  let $y := $x + 1",
            "  return $y + $x",
            "};",
            "local:f($x)",
        ].join("\n");
        const document = testDocument("references-shadowing", source);

        const locations = findReferenceLocations(document, positionAtNth(document, "$x", 2), false);

        expect(locations.map((location) => location.range.start.line)).toEqual([2, 3]);
    });

    it("includes declaration when requested", () => {
        const source = ["for $x at $pos in (1, 2, 3)", "let $y := $x + 1", "return $x + $y"].join(
            "\n",
        );
        const document = testDocument("references-include-decl", source);

        const withoutDeclaration = findReferenceLocations(
            document,
            positionAtNth(document, "$x", 2),
            false,
        );
        const withDeclaration = findReferenceLocations(
            document,
            positionAtNth(document, "$x", 2),
            true,
        );

        expect(withoutDeclaration.map((location) => location.range.start.line)).toEqual([1, 2]);
        expect(withDeclaration.map((location) => location.range.start.line)).toEqual([0, 1, 2]);
    });

    it("returns empty result outside variable identifiers", () => {
        const source = "declare function local:f($x) { $x };";
        const document = testDocument("references-miss", source);

        const locations = findReferenceLocations(document, positionAt(document, "declare"), true);

        expect(locations).toEqual([]);
    });

    it("finds references for a function from its declaration", () => {
        const source = ["declare function local:f($x) { $x };", "local:f(1) + local:f(2)"].join(
            "\n",
        );
        const document = testDocument("references-function", source);

        const locations = findReferenceLocations(document, positionAt(document, "local:f"), true);

        expect(locations.map((location) => location.range.start)).toEqual([
            { line: 0, character: "declare function ".length },
            { line: 1, character: 0 },
            { line: 1, character: "local:f(1) + ".length },
        ]);
    });

    it("finds references only for the matching function arity", () => {
        const source = [
            "declare function local:f($a, $b) { 0 };",
            "declare function local:f($x) { $x };",
            "local:f(1, 2) + local:f(0)",
        ].join("\n");
        const document = testDocument("references-function-overloads", source);

        const locations = findReferenceLocations(
            document,
            positionAt(document, "local:f(1, 2)"),
            true,
        );

        expect(locations.map((location) => location.range.start)).toEqual([
            { line: 0, character: "declare function ".length },
            { line: 2, character: 0 },
        ]);
    });

    it("finds references when cursor is on dollar sign of declaration", () => {
        const source = "declare function local:f($x) { $x };";
        const document = testDocument("references-declaration-dollar", source);

        const locations = findReferenceLocations(document, positionAt(document, "$x"), false);

        expect(locations.map((location) => location.range.start.line)).toEqual([0]);
    });

    it("finds references for URI-qualified functions", () => {
        const document = testDocumentFromUri(
            [
                'xquery version "3.1";',
                "declare function Q{https://example.com}f() { 1 };",
                "Q{https://example.com}f() + Q{https://example.com}f()",
            ],
            {
                uri: "file:///references-uri-qualified.xq",
                languageId: "xquery",
            },
        );

        const locations = findReferenceLocations(
            document,
            positionAt(document, "Q{https://example.com}f"),
            true,
        );

        expect(locations.map((location) => location.range.start)).toEqual([
            { line: 1, character: "declare function ".length },
            { line: 2, character: 0 },
            { line: 2, character: "Q{https://example.com}f() + ".length },
        ]);
    });
});
