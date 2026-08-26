import { getTypeAtPosition } from "server/integrations/rumble/operations/type-at-position/service.js";
import { describe, expect, it, vi } from "vitest";

import { createMockWrapperClient, testDocument } from "./test-utils.js";

describe("type at position", () => {
    it("sends the document and position to the wrapper", async () => {
        const sendRequest = vi.fn().mockResolvedValue({
            id: 1,
            responseType: "type-at-position",
            body: {
                sequenceType: {
                    itemType: {
                        kind: "named",
                        name: {
                            namespaceUri: "http://www.w3.org/2001/XMLSchema",
                            prefix: "xs",
                            localName: "integer",
                        },
                    },
                    arity: "",
                },
                range: {
                    start: { line: 0, character: 0 },
                    end: { line: 0, character: 5 },
                },
            },
            error: null,
        });
        const wrapper = createMockWrapperClient({ sendRequest });
        const document = testDocument("type-at-position", "1 + 2");

        const result = await getTypeAtPosition(document, { line: 0, character: 5 }, wrapper);

        expect(sendRequest).toHaveBeenCalledWith({
            requestType: "type-at-position",
            body: Buffer.from("1 + 2", "utf8").toString("base64"),
            documentUri: document.uri,
            position: { line: 0, character: 5 },
        });
        expect(result.sequenceType?.itemType.kind).toBe("named");
        expect(result.range?.end).toEqual({ line: 0, character: 5 });
    });

    it("returns an empty result when the wrapper request fails", async () => {
        const wrapper = createMockWrapperClient({
            sendRequest: vi.fn().mockRejectedValue(new Error("unavailable")),
        });
        const document = testDocument("type-at-position-error", "1 + 2");

        await expect(
            getTypeAtPosition(document, { line: 0, character: 5 }, wrapper),
        ).resolves.toEqual({});
    });
});
