import { collectInlayHints } from "server/inlay-hints.js";
import { describe, expect, it } from "vitest";

import { testDocument } from "./test-utils.js";

describe("JSONiq inlay hints", () => {
    it("returns parameter name hints for builtin function calls", () => {
        const document = testDocument("inlay-builtin", ['fn:substring("hello", 1, 2)']);
        const hints = collectInlayHints(document, fullDocumentRange(document));

        expect(hints.map((hint) => hint.label)).toEqual([
            "$sourceString: ",
            "$start: ",
            "$length: ",
        ]);
    });

    it("returns parameter name hints for source function calls", () => {
        const document = testDocument("inlay-source", [
            "declare function local:my-add($left, $right) {",
            "  $left + $right",
            "};",
            "local:my-add(1, 2)",
        ]);
        const hints = collectInlayHints(document, fullDocumentRange(document));

        expect(hints.map((hint) => hint.label)).toEqual(["$left: ", "$right: "]);
    });
});

function fullDocumentRange(document: ReturnType<typeof testDocument>) {
    return {
        start: { line: 0, character: 0 },
        end: document.positionAt(document.getText().length),
    };
}
