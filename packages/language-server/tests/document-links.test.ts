import path from "node:path";
import { pathToFileURL } from "node:url";

import { collectDocumentLinks } from "server/lsp/features/document-links.js";
import { describe, expect, it } from "vitest";
import type { TextDocument } from "vscode-languageserver-textdocument";

import { parserService } from "./services.js";
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

        expect(collectDocumentLinks(document, parserService)).toEqual([
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

        expect(collectDocumentLinks(document, parserService)).toEqual([
            expect.objectContaining({
                target: pathToFileURL(path.join(directory, "math.jq")).toString(),
            }),
        ]);
    });

    it("does not link a non-file namespace", () => {
        const document = testDocumentFromUri(['import module namespace lib = "urn:example:lib";'], {
            uri: pathToFileURL(path.join(directory, "urn-link-main.jq")).toString(),
        });

        expect(collectDocumentLinks(document, parserService)).toEqual([]);
    });

    it.each(["jsoniq", "xquery"])(
        "links every schema hint relative to the declared base URI in %s",
        (language) => {
            const document = testDocumentFromUri(
                [
                    'declare base-uri "schemas/";',
                    'import schema namespace s = "urn:test" at "types.xsd", "nested/extra.xsd";',
                ],
                {
                    uri: pathToFileURL(
                        path.join(
                            directory,
                            language === "xquery" ? "schema-links.xq" : "schema-links.jq",
                        ),
                    ).href,
                    languageId: language,
                },
            );
            // Location literals are clickable; the namespace identifier must not be treated as a file.
            expect(collectDocumentLinks(document, parserService)).toEqual([
                {
                    range: rangeAt(document, '"types.xsd"', 0),
                    target: pathToFileURL(path.join(directory, "schemas", "types.xsd")).href,
                },
                {
                    range: rangeAt(document, '"nested/extra.xsd"', 0),
                    target: pathToFileURL(path.join(directory, "schemas", "nested", "extra.xsd"))
                        .href,
                },
            ]);
        },
    );

    it("resolves an absolute base URI and keeps absolute schema hints unchanged", () => {
        const absoluteSchema = pathToFileURL(path.join(directory, "external.xsd")).href;
        const document = testDocumentFromUri(
            [
                'declare base-uri "file:///schemas/";',
                `import schema namespace s = "urn:test" at "types.xsd", "${absoluteSchema}";`,
            ],
            { uri: pathToFileURL(path.join(directory, "absolute-schema-links.jq")).href },
        );
        expect(collectDocumentLinks(document, parserService).map((link) => link.target)).toEqual([
            "file:///schemas/types.xsd",
            absoluteSchema,
        ]);
    });

    it("links a file-like schema namespace when there are no location hints", () => {
        const document = testDocumentFromUri('import schema "types.xsd";', {
            uri: pathToFileURL(path.join(directory, "schema-fallback.xq")).href,
            languageId: "xquery",
        });
        // This follows Rumble's namespace-as-location fallback, including imports without a prefix.
        expect(collectDocumentLinks(document, parserService)).toEqual([
            {
                range: rangeAt(document, '"types.xsd"', 0),
                target: pathToFileURL(path.join(directory, "types.xsd")).href,
            },
        ]);
    });

    it("ignores remote schemas and invalid bases without losing module links", () => {
        const document = testDocumentFromUri(
            [
                'declare base-uri "http://[";',
                'import module namespace lib = "urn:lib" at "lib.jq";',
                'import schema namespace s = "urn:test" at "types.xsd";',
            ],
            { uri: pathToFileURL(path.join(directory, "invalid-schema-base.jq")).href },
        );
        expect(collectDocumentLinks(document, parserService).map((link) => link.target)).toEqual([
            pathToFileURL(path.join(directory, "lib.jq")).href,
        ]);
        const remote = testDocumentFromUri(
            'import schema namespace s = "urn:test" at "https://example.com/types.xsd";',
            { uri: pathToFileURL(path.join(directory, "remote-schema-links.jq")).href },
        );
        expect(collectDocumentLinks(remote, parserService)).toEqual([]);
    });
});
