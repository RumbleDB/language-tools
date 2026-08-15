import path from "node:path";
import { pathToFileURL } from "node:url";

import { collectDocumentLinks } from "server/lsp/features/document-links.js";
import { describe, expect, it } from "vitest";
import type { TextDocument } from "vscode-languageserver-textdocument";

import { positionAtNth, testDocumentFromUri } from "./test-utils.js";

function rangeAt(document: TextDocument, text: string, occurrence: number) {
    const start = positionAtNth(document, text, occurrence);
    return { start, end: document.positionAt(document.offsetAt(start) + text.length) };
}

describe("document links", () => {
    const directory = path.join(process.cwd(), "tests", "samples", "modules");

    it("links every explicit module location", () => {
        const document = testDocumentFromUri(
            ['import module namespace math = "math.jq" at "math.jq", "math-extra.jq";'],
            { uri: pathToFileURL(path.join(directory, "explicit-links-main.jq")).toString() },
        );

        expect(collectDocumentLinks(document)).toEqual([
            {
                range: rangeAt(document, '"math.jq"', 1),
                target: pathToFileURL(path.join(directory, "math.jq")).toString(),
            },
            {
                range: rangeAt(document, '"math-extra.jq"', 0),
                target: pathToFileURL(path.join(directory, "math-extra.jq")).toString(),
            },
        ]);
    });

    it("links a file-like namespace when at is absent", () => {
        const document = testDocumentFromUri(['import module namespace math = "math.jq";'], {
            uri: pathToFileURL(path.join(directory, "fallback-link-main.jq")).toString(),
        });

        expect(collectDocumentLinks(document)).toEqual([
            expect.objectContaining({
                target: pathToFileURL(path.join(directory, "math.jq")).toString(),
            }),
        ]);
    });

    it("does not link a non-file namespace", () => {
        const document = testDocumentFromUri(['import module namespace lib = "urn:example:lib";'], {
            uri: pathToFileURL(path.join(directory, "urn-link-main.jq")).toString(),
        });

        expect(collectDocumentLinks(document)).toEqual([]);
    });
});
