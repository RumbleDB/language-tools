import { getParserAdapterForDocument } from "server/parser/registry.js";
import { describe, expect, it } from "vitest";

import { testDocumentFromUri } from "./test-utils.js";

describe("XQuery parser activation", () => {
    it("activates XQuery parser if languageId is xquery", () => {
        const document = testDocumentFromUri(["let $x := 1 return $x"], {
            uri: "file:///test.xq",
            languageId: "xquery",
        });

        const adapter = getParserAdapterForDocument(document);
        expect(adapter).toBeDefined();
        expect(adapter?.id).toBe("xquery");
    });

    it("activates XQuery parser if content contains 'xquery version'", () => {
        const document = testDocumentFromUri(['xquery version "3.1";', "let $x := 1 return $x"], {
            uri: "file:///test.jq",
            languageId: "jsoniq",
        });

        const adapter = getParserAdapterForDocument(document);
        expect(adapter).toBeDefined();
        expect(adapter?.id).toBe("xquery");
    });

    it("activates JSONiq parser if content contains 'jsoniq version' even if it ends with .xq", () => {
        const document = testDocumentFromUri(['jsoniq version "3.1";', "let $x := 1 return $x"], {
            uri: "file:///test.xq",
            languageId: "jsoniq",
        });

        const adapter = getParserAdapterForDocument(document);
        expect(adapter).toBeDefined();
        expect(adapter?.id).toBe("jsoniq");
    });
});
