import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";

import { RumbleWrapperClient } from "server/integrations/rumble/client.js";
import { clearStaticTypecheckCache } from "server/integrations/rumble/operations/static-typecheck/service.js";
import { collectStaticTypecheckDiagnostics } from "server/lsp/diagnostics/static-typecheck.js";
import { describe, expect, it, vi } from "vitest";

import { createMockWrapperClient, testDocument, testDocumentFromUri } from "./test-utils.js";

describe("static typecheck diagnostics", () => {
    it("reports a child step that the imported schema does not declare", async () => {
        const directory = mkdtempSync(path.join(tmpdir(), "static-typecheck-schema-"));
        writeFileSync(
            path.join(directory, "order.xsd"),
            `<xs:schema xmlns:xs="http://www.w3.org/2001/XMLSchema" targetNamespace="urn:order"
                       elementFormDefault="qualified">
                <xs:element name="order">
                    <xs:complexType><xs:sequence><xs:element name="price" type="xs:decimal"/></xs:sequence></xs:complexType>
                </xs:element>
            </xs:schema>`,
        );
        const document = testDocumentFromUri(
            [
                'import schema namespace o = "urn:order" at "order.xsd";',
                "let $order := validate { <o:order><o:price>1</o:price></o:order> }",
                "return $order/o:prices",
            ],
            {
                uri: pathToFileURL(path.join(directory, "query.xq")).toString(),
                languageId: "xquery",
            },
        );
        clearStaticTypecheckCache(document.uri);

        const diagnostics = await collectStaticTypecheckDiagnostics(
            document,
            new RumbleWrapperClient(),
        );

        expect(diagnostics).toEqual([
            expect.objectContaining({
                code: "XPST0005",
                message:
                    "The schema declares no child element o:prices for schema-element(o:order). It declares o:price.",
            }),
        ]);
        // The diagnostic marks the step, not the whole path.
        expect(diagnostics[0]?.range.start).toEqual({
            line: 2,
            character: "return $order/".length,
        });
    }, 45_000);

    it("does not attach imported module errors to the importing document", async () => {
        const document = testDocument("static-typecheck-main", "1");
        const importedModuleUri = "file:///static-typecheck-library.jq";
        clearStaticTypecheckCache(document.uri);
        const wrapper = createMockWrapperClient({
            sendRequest: vi.fn().mockResolvedValue({
                id: 1,
                responseType: "static-typecheck",
                body: {
                    errors: [
                        {
                            code: "XPTY0004",
                            message: "Error in imported module",
                            location: importedModuleUri,
                            range: {
                                start: { line: 1, character: 0 },
                                end: { line: 1, character: 1 },
                            },
                        },
                        {
                            code: "XPTY0004",
                            message: "Error in main module",
                            location: document.uri,
                            range: {
                                start: { line: 0, character: 0 },
                                end: { line: 0, character: 1 },
                            },
                        },
                    ],
                },
                error: null,
            }),
        });

        await expect(collectStaticTypecheckDiagnostics(document, wrapper)).resolves.toEqual([
            expect.objectContaining({ message: "Error in main module" }),
        ]);
    });

    it("reports an imported library error only on the library document", async () => {
        const wrapper = new RumbleWrapperClient();
        const fixture = path.join(process.cwd(), "tests", "samples", "modules", "invalid-type.jq");
        const libraryUri = pathToFileURL(fixture).toString();
        const importer = testDocumentFromUri(
            [
                'import module namespace invalid = "urn:invalid-type" at "invalid-type.jq";',
                "invalid:value()",
            ],
            {
                uri: pathToFileURL(
                    path.join(path.dirname(fixture), "invalid-type-main.jq"),
                ).toString(),
            },
        );
        const library = testDocumentFromUri(readFileSync(fixture, "utf8"), { uri: libraryUri });
        clearStaticTypecheckCache(importer.uri);
        clearStaticTypecheckCache(library.uri);

        await expect(collectStaticTypecheckDiagnostics(importer, wrapper)).resolves.toEqual([]);
        await expect(collectStaticTypecheckDiagnostics(library, wrapper)).resolves.toContainEqual(
            expect.objectContaining({ code: "XPTY0004" }),
        );
    });
});
