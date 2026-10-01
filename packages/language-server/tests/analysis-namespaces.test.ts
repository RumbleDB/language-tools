import {
    analyzeDocument,
    DEFAULT_NAMESPACES,
    findSymbolAtPosition,
} from "server/analysis/index.js";
import { ParserService } from "server/parser/index.js";
import { describe, expect, it } from "vitest";
import { TextDocument } from "vscode-languageserver-textdocument";

import { positionAtNth, testDocumentFromUri } from "./test-utils.js";

describe("analysis namespace bindings", () => {
    const parser = new ParserService();

    it.each(["jsoniq", "xquery"])(
        "exposes defaults and module bindings consistently with name resolution in %s",
        (language) => {
            const document = testDocumentFromUri(
                [
                    'import module namespace lib = "urn:library" at "lib.jq";',
                    'import schema namespace s = "urn:schema" at "types.xsd";',
                    'declare namespace alias = "urn:schema";',
                    'declare namespace fn = "urn:custom";',
                    "declare function fn:f() { 1 };",
                    "fn:f()",
                ],
                {
                    uri: `file:///analysis-namespaces.${language === "xquery" ? "xq" : "jq"}`,
                    languageId: language,
                },
            );
            const analysis = analyzeDocument(document, parser.parse(document).ast);
            expect(analysis.namespaces.get("xs")).toBe(DEFAULT_NAMESPACES.get("xs"));
            expect(analysis.namespaces.get("lib")).toBe("urn:library");
            expect(analysis.namespaces.get("s")).toBe("urn:schema");
            expect(analysis.namespaces.get("alias")).toBe("urn:schema");
            // A module binding takes precedence over the default, just as it does for resolving calls.
            expect(analysis.namespaces.get("fn")).toBe("urn:custom");
            const occurrence = findSymbolAtPosition(analysis, positionAtNth(document, "fn:f()", 1));
            expect(occurrence?.declaration).toMatchObject({
                name: { qname: { namespaceUri: analysis.namespaces.get("fn"), localName: "f" } },
            });
        },
    );

    it("keeps previous analyses and default bindings unchanged when a module binding is removed", () => {
        const document = testDocumentFromUri('declare namespace fn = "urn:custom"; 1', {
            uri: "file:///analysis-namespace-edit.jq",
        });
        const previous = analyzeDocument(document, parser.parse(document).ast);
        TextDocument.update(document, [{ text: "1" }], 2);
        const current = analyzeDocument(document, parser.parse(document).ast);
        // Removing an override restores the default without mutating an older analysis snapshot.
        expect(previous.namespaces.get("fn")).toBe("urn:custom");
        expect(current.namespaces.get("fn")).toBe("http://www.w3.org/2005/xpath-functions");
        expect(DEFAULT_NAMESPACES.get("fn")).toBe("http://www.w3.org/2005/xpath-functions");
    });
});
