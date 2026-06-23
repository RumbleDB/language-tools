import { getTypeAtPosition } from "server/type-at-position/service.js";
import { getWrapperClient } from "server/wrapper/client.js";
import { afterEach, describe, expect, it, vi } from "vitest";

import { testDocument } from "./test-utils.js";

describe("type at position", () => {
    afterEach(() => {
        vi.restoreAllMocks();
    });

    it("sends the document and position to the wrapper", async () => {
        const document = testDocument("type-at-position", "1 + 2");
        const sendRequest = vi.spyOn(getWrapperClient(), "sendRequest").mockResolvedValue({
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

        const result = await getTypeAtPosition(document, { line: 0, character: 5 });

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
        const document = testDocument("type-at-position-error", "1 + 2");
        vi.spyOn(getWrapperClient(), "sendRequest").mockRejectedValue(new Error("unavailable"));

        await expect(getTypeAtPosition(document, { line: 0, character: 5 })).resolves.toEqual({});
    });
});
