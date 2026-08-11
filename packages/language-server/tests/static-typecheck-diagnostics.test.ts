import { readFileSync } from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";

import { collectStaticTypecheckDiagnostics } from "server/static-typecheck/diagnostics.js";
import type { StaticTypecheckResponse } from "server/static-typecheck/service.js";
import type { DocumentStamp } from "server/workspace/document-stamp.js";
import { getWrapperClient } from "server/wrapper/client.js";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { TextDocument } from "vscode-languageserver-textdocument";

import { testDocument, testDocumentFromUri } from "./test-utils.js";

function stamp(document: TextDocument, workspaceRevision = 1): DocumentStamp {
    return {
        uri: document.uri,
        documentVersion: document.version,
        workspaceRevision,
    };
}

describe("static typecheck diagnostics", () => {
    afterEach(() => {
        vi.useRealTimers();
        vi.restoreAllMocks();
    });

    it("does not attach imported module errors to the importing document", async () => {
        const document = testDocument("static-typecheck-main", "1");
        const importedModuleUri = "file:///static-typecheck-library.jq";
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

        await expect(collectStaticTypecheckDiagnostics(document, stamp(document))).resolves.toEqual(
            [expect.objectContaining({ message: "Error in main module" })],
        );
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
        await expect(collectStaticTypecheckDiagnostics(importer, stamp(importer))).resolves.toEqual(
            [],
        );
        await expect(
            collectStaticTypecheckDiagnostics(library, stamp(library)),
        ).resolves.toContainEqual(expect.objectContaining({ code: "XPTY0004" }));
    });

    it("does not send a superseded backend request during the debounce window", async () => {
        vi.useFakeTimers();
        const document = testDocument("static-typecheck-debounce", "1");
        const sendRequest = vi.spyOn(getWrapperClient(), "sendRequest").mockResolvedValue({
            id: 1,
            responseType: "static-typecheck",
            body: { errors: [] },
            error: null,
        });

        const superseded = collectStaticTypecheckDiagnostics(document, stamp(document, 1));
        const current = collectStaticTypecheckDiagnostics(document, stamp(document, 2));
        await vi.advanceTimersByTimeAsync(250);
        await Promise.all([superseded, current]);

        expect(sendRequest).toHaveBeenCalledTimes(1);
    });

    it("does not cache a response from an older in-flight request", async () => {
        vi.useFakeTimers();
        const document = testDocument("static-typecheck-invalidation", "1");
        let resolveFirst!: (response: StaticTypecheckResponse) => void;
        const firstResponse = new Promise<StaticTypecheckResponse>((resolve) => {
            resolveFirst = resolve;
        });
        const response = (message: string): StaticTypecheckResponse => ({
            id: 1,
            responseType: "static-typecheck",
            body: {
                errors: [
                    {
                        code: "XPTY0004",
                        message,
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
        const sendRequest = vi
            .spyOn(getWrapperClient(), "sendRequest")
            .mockReturnValueOnce(firstResponse)
            .mockResolvedValueOnce(response("fresh"));

        const staleDiagnostics = collectStaticTypecheckDiagnostics(document, stamp(document, 1));
        await vi.advanceTimersByTimeAsync(250);

        const freshDiagnostics = collectStaticTypecheckDiagnostics(document, stamp(document, 2));
        await vi.advanceTimersByTimeAsync(250);
        await expect(freshDiagnostics).resolves.toContainEqual(
            expect.objectContaining({ message: "fresh" }),
        );
        resolveFirst(response("stale"));
        await staleDiagnostics;

        await expect(
            collectStaticTypecheckDiagnostics(document, stamp(document, 2)),
        ).resolves.toContainEqual(expect.objectContaining({ message: "fresh" }));
        expect(sendRequest).toHaveBeenCalledTimes(2);
    });
});
