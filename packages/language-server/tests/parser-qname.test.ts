import { parseQNameText } from "server/parser/types/name.js";
import { describe, expect, it } from "vitest";

describe("QName parsing", () => {
    it("preserves URI-qualified QNames", () => {
        expect(parseQNameText("Q{https://example.com}a")).toEqual({
            kind: "uri-qualified-qname",
            namespaceUri: "https://example.com",
            localName: "a",
        });
    });

    it("parses prefixed QNames", () => {
        expect(parseQNameText("local:a")).toEqual({
            kind: "prefixed-qname",
            prefix: "local",
            localName: "a",
        });
    });

    it("parses unprefixed QNames", () => {
        expect(parseQNameText("a")).toEqual({
            kind: "unprefixed-qname",
            localName: "a",
        });
    });
});
