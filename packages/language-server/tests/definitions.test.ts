import { findDefinitionLocation } from "server/definitions.js";
import { describe, expect, it } from "vitest";

import { testDocument } from "./test-utils.js";

describe("JSONiq go-to-definition", () => {
    it("resolves variable reference to the nearest declaration", () => {
        const document = testDocument("definitions-shadowing", [
            "declare variable $x := 10;",
            "declare function local:f($x) {",
            "  let $y := $x + 1",
            "  return $y + $x",
            "};",
            "local:f($x)",
        ]);

        const localReference = findDefinitionLocation(document, { line: 3, character: 15 });
        const globalReference = findDefinitionLocation(document, { line: 5, character: 9 });

        expect(localReference?.range.start.line).toBe(1);
        expect(globalReference?.range.start.line).toBe(0);
    });

    it("returns declaration location when cursor is already on declaration", () => {
        const firstLine = "declare function local:f($x) {";
        const document = testDocument("definitions-on-declaration", [
            firstLine,
            "  return $x",
            "};",
        ]);

        const declarationCharacter = firstLine.indexOf("$x") + 1;
        const location = findDefinitionLocation(document, {
            line: 0,
            character: declarationCharacter,
        });

        expect(location).toBeDefined();
        expect(location?.range.start.line).toBe(0);
    });

    it("resolves definition when cursor is on the dollar sign of a parameter", () => {
        const firstLine = "declare function local:f($x) {";
        const document = testDocument("definitions-parameter-dollar", [
            firstLine,
            "  return $x",
            "};",
        ]);

        const location = findDefinitionLocation(document, {
            line: 0,
            character: firstLine.indexOf("$x"),
        });

        expect(location).toBeDefined();
        expect(location?.range.start.line).toBe(0);
    });

    it("resolves function call to function declaration", () => {
        const document = testDocument("definitions-function-call", [
            "declare function local:f($x) {",
            "  $x",
            "};",
            "local:f(1)",
        ]);

        const location = findDefinitionLocation(document, { line: 3, character: 2 });

        expect(location).toBeDefined();
        expect(location?.range.start).toEqual({ line: 0, character: "declare function ".length });
        expect(location?.range.end).toEqual({
            line: 0,
            character: "declare function local:f".length,
        });
    });

    it("returns null when position is not on a resolvable variable", () => {
        const document = testDocument("definitions-null", "1 + 2");

        const location = findDefinitionLocation(document, { line: 0, character: 0 });

        expect(location).toBeNull();
    });
});
