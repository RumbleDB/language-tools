import { parseDocument } from "server/parser/index.js";
import { describe, expect, it } from "vitest";

import { testDocumentFromUri } from "./test-utils.js";

describe.each(["jsoniq", "xquery"])("%s parser recovery", (languageId) => {
    it("recovers from a named function reference without an arity", () => {
        const document = testDocumentFromUri("local:function#", {
            uri: `file:///incomplete-named-function-reference.${languageId}`,
            languageId,
        });

        const parsed = parseDocument(document);
        const reference = parsed.ast.children.find(
            (node) => node.kind === "named-function-reference",
        );

        expect(parsed.diagnostics.length).toBeGreaterThan(0);
        expect(reference?.name.arity).toBeUndefined();
    });
});
