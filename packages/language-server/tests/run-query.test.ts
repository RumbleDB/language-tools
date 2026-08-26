import {
    runQuery,
    runQueryFromSource,
} from "server/integrations/rumble/operations/run-query/service.js";
import { describe, expect, it, vi } from "vitest";

import { createMockWrapperClient, testDocument } from "./test-utils.js";

describe("run query service", () => {
    it("sends document text and documentUri to wrapper", async () => {
        const sendRequest = vi.fn().mockResolvedValue({
            id: 1,
            responseType: "run-query",
            body: {
                output: "2",
                error: null,
            },
            error: null,
        });
        const wrapper = createMockWrapperClient({ sendRequest });
        const document = testDocument("run-query-test", "1 + 1");

        const result = await runQuery(document, wrapper);

        expect(sendRequest).toHaveBeenCalledWith({
            requestType: "run-query",
            body: Buffer.from("1 + 1", "utf8").toString("base64"),
            documentUri: document.uri,
        });
        expect(result.output).toBe("2");
        expect(result.error).toBeNull();
    });

    it("handles error response from wrapper", async () => {
        const wrapper = createMockWrapperClient({
            sendRequest: vi.fn().mockRejectedValue(new Error("Syntax error")),
        });
        const document = testDocument("run-query-error-test", "1 +");

        const result = await runQuery(document, wrapper);

        expect(result.output).toBeNull();
        expect(result.error).toBe("Syntax error");
    });

    it("allows running query directly from source and URI", async () => {
        const sendRequest = vi.fn().mockResolvedValue({
            id: 2,
            responseType: "run-query",
            body: {
                output: "42",
                error: null,
            },
            error: null,
        });
        const wrapper = createMockWrapperClient({ sendRequest });

        const result = await runQueryFromSource("file:///test.jq", "40 + 2", wrapper);

        expect(sendRequest).toHaveBeenCalledWith({
            requestType: "run-query",
            body: Buffer.from("40 + 2", "utf8").toString("base64"),
            documentUri: "file:///test.jq",
        });
        expect(result.output).toBe("42");
    });
});
