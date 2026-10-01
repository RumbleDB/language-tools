import type { SchemaCatalogWireResult } from "server/integrations/rumble/operations/schema-catalog/protocol.js";
import { getSchemaCatalog } from "server/integrations/rumble/operations/schema-catalog/service.js";
import { describe, expect, it, vi } from "vitest";

import { createMockWrapperClient, testDocument } from "./test-utils.js";

describe("schema catalog", () => {
    it("sends schema imports and base URI and returns schema-loading errors", async () => {
        const body: SchemaCatalogWireResult = {
            types: [],
            constructors: [],
            errors: [
                {
                    code: "XQST0059",
                    message: "Schema could not be loaded",
                    location: "file:///query.xq",
                    range: { start: { line: 0, character: 0 }, end: { line: 0, character: 1 } },
                },
            ],
        };
        const sendRequest = vi.fn().mockResolvedValue({
            id: 1,
            responseType: "schema-catalog",
            body,
            error: null,
        });
        const document = testDocument(
            "schema-catalog",
            'import schema namespace t = "urn:café"; 1',
        );

        const input = {
            imports: [{ namespaceUri: "urn:café", locations: ["types.xsd"] }],
            baseUri: "schemas/",
        };
        const result = await getSchemaCatalog(
            document.uri,
            input,
            createMockWrapperClient({ sendRequest }),
        );

        expect(sendRequest).toHaveBeenCalledExactlyOnceWith({
            requestType: "schema-catalog",
            body: Buffer.from(JSON.stringify(input), "utf8").toString("base64"),
            documentUri: document.uri,
        });
        expect(result).toEqual(body);
    });

    it("does not send a request when the wrapper is unavailable", async () => {
        const sendRequest = vi.fn();
        const client = createMockWrapperClient({ isUsable: () => false, sendRequest });

        expect(
            await getSchemaCatalog("file:///schema-catalog.jq", { imports: [] }, client),
        ).toBeUndefined();
        expect(sendRequest).not.toHaveBeenCalled();
    });

    it.each([
        ["a rejected request", () => Promise.reject(new Error("unavailable"))],
        [
            "a wrapper error",
            () =>
                Promise.resolve({
                    id: 1,
                    responseType: "schema-catalog",
                    body: null,
                    error: { code: "UNSUPPORTED_REQUEST_TYPE", message: "Unsupported request" },
                }),
        ],
    ])("returns unavailable for %s", async (_name, response) => {
        const client = createMockWrapperClient({
            sendRequest: vi.fn().mockImplementation(response),
        });

        expect(
            await getSchemaCatalog("file:///schema-catalog.jq", { imports: [] }, client),
        ).toBeUndefined();
    });
});
