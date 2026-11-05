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

    it("activates XQuery parser for a declaration that only names an encoding", () => {
        const document = testDocumentFromUri(['xquery encoding "UTF-8";', "1"], {
            uri: "file:///test.jq",
            languageId: "jsoniq",
        });

        expect(getParserAdapterForDocument(document)?.id).toBe("xquery");
    });

    it.each([
        ["a string", '"xquery version"'],
        ["a comment", '(: xquery version "3.1"; :) 1'],
        ["a later declaration", '1; xquery version "3.1"; 2'],
        ["an unfinished declaration", 'xquery version "3.1"'],
    ])("keeps the language ID when the text is only in %s", (_, source) => {
        const document = testDocumentFromUri([source], {
            uri: "file:///test.jq",
            languageId: "jsoniq",
        });

        expect(getParserAdapterForDocument(document)?.id).toBe("jsoniq");
    });

    it("reads the declaration after the magic line of a notebook cell", () => {
        const document = testDocumentFromUri(["%%jsoniq", 'xquery version "3.1";', "1"], {
            uri: "vscode-notebook-cell:/test.ipynb#cell",
            languageId: "python",
        });

        expect(getParserAdapterForDocument(document)?.id).toBe("xquery");
    });
});
