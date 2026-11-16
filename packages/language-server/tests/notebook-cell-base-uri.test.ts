import { clearStaticTypecheckCache } from "server/integrations/rumble/operations/static-typecheck/service.js";
import { collectStaticTypecheckDiagnostics } from "server/lsp/diagnostics/static-typecheck.js";
import { documentBaseUri } from "server/parser/utils.js";
import { resolveModuleLocations, staticBaseUri } from "server/workspace/module-resolver.js";
import { describe, expect, it, vi } from "vitest";

import { createMockWrapperClient, testDocumentFromUri } from "./test-utils.js";

const CELL_URI = "vscode-notebook-cell:/dir/analysis.ipynb#W1sZmlsZQ%3D%3D";
const NOTEBOOK_URI = "file:///dir/analysis.ipynb";
const range = { start: { line: 0, character: 0 }, end: { line: 0, character: 1 } };

describe("notebook cell base URI", () => {
    it("resolves a cell's relative URIs against its notebook", () => {
        expect(documentBaseUri(CELL_URI)).toBe(NOTEBOOK_URI);
        expect(documentBaseUri("file:///dir/query.jq")).toBe("file:///dir/query.jq");
        // An untitled notebook has no directory to resolve against.
        expect(documentBaseUri("vscode-notebook-cell:Untitled-1.ipynb#cell")).toBe(
            "vscode-notebook-cell:Untitled-1.ipynb#cell",
        );
    });

    it("locates a cell's modules and files next to its notebook", () => {
        const imported = {
            namespaceUri: "urn:lib",
            namespaceUriRange: range,
            locations: [{ uri: "lib.jq", range }],
            range,
        };

        expect(resolveModuleLocations(CELL_URI, imported)[0]?.targetUri).toBe("file:///dir/lib.jq");
        expect(staticBaseUri(CELL_URI, undefined)).toBe(NOTEBOOK_URI);
        expect(staticBaseUri(CELL_URI, "data/")).toBe("file:///dir/data/");
    });

    it("sends RumbleDB the notebook as the cell's base URI, and keeps the errors located there", async () => {
        const document = testDocumentFromUri(["%%jsoniq", '1 + "a"'], {
            uri: CELL_URI,
            languageId: "python",
        });
        clearStaticTypecheckCache(document.uri);
        const sendRequest = vi.fn().mockResolvedValue({
            id: 1,
            responseType: "static-typecheck",
            body: {
                errors: [
                    {
                        code: "XPTY0004",
                        message: "Mismatch",
                        location: NOTEBOOK_URI,
                        range,
                        certain: true,
                    },
                ],
            },
            error: null,
        });

        const diagnostics = await collectStaticTypecheckDiagnostics(
            document,
            createMockWrapperClient({ sendRequest }),
        );

        expect(sendRequest.mock.calls[0]?.[0]).toMatchObject({ documentUri: NOTEBOOK_URI });
        expect(diagnostics).toEqual([expect.objectContaining({ message: "Mismatch" })]);
    });
});
