import { readFileSync } from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";

import { getWrapperClient } from "server/integrations/rumble/client.js";
import { collectStaticTypecheckDiagnostics } from "server/static-typecheck/diagnostics.js";
import { clearStaticTypecheckCache } from "server/static-typecheck/service.js";
import { afterEach, describe, expect, it, vi } from "vitest";

import { testDocument, testDocumentFromUri } from "./test-utils.js";

describe("static typecheck diagnostics", () => {
    afterEach(() => {
        vi.restoreAllMocks();
    });

    it("does not attach imported module errors to the importing document", async () => {
        const document = testDocument("static-typecheck-main", "1");
        const importedModuleUri = "file:///static-typecheck-library.jq";
        clearStaticTypecheckCache(document.uri);
        vi.spyOn(getWrapperClient(), "sendRequest").mockResolvedValue({
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
        });

        await expect(collectStaticTypecheckDiagnostics(document)).resolves.toEqual([
            expect.objectContaining({ message: "Error in main module" }),
        ]);
    });

    it("reports an imported library error only on the library document", async () => {
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

        await expect(collectStaticTypecheckDiagnostics(importer)).resolves.toEqual([]);
        await expect(collectStaticTypecheckDiagnostics(library)).resolves.toContainEqual(
            expect.objectContaining({ code: "XPTY0004" }),
        );
    });
});
