import { RumbleWrapperClient } from "server/integrations/rumble/client.js";
import {
    runQuery,
    runQueryFromSource,
} from "server/integrations/rumble/operations/run-query/service.js";
import { afterEach, describe, expect, it, vi } from "vitest";

import { testDocument } from "./test-utils.js";

describe("run query service", () => {
    afterEach(() => {
        vi.restoreAllMocks();
    });

    it("sends document text and documentUri to wrapper", async () => {
        const wrapper = new RumbleWrapperClient();
        const document = testDocument("run-query-test", "1 + 1");
        const sendRequest = vi.spyOn(wrapper, "sendRequest").mockResolvedValue({
            id: 1,
            responseType: "run-query",
            body: {
                output: "2",
                error: null,
            },
            error: null,
        });

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
        const wrapper = new RumbleWrapperClient();
        const document = testDocument("run-query-error-test", "1 +");
        vi.spyOn(wrapper, "sendRequest").mockRejectedValue(new Error("Syntax error"));

        const result = await runQuery(document, wrapper);

        expect(result.output).toBeNull();
        expect(result.error).toBe("Syntax error");
    });

    it("allows running query directly from source and URI", async () => {
        const wrapper = new RumbleWrapperClient();
        const sendRequest = vi.spyOn(wrapper, "sendRequest").mockResolvedValue({
            id: 2,
            responseType: "run-query",
            body: {
                output: "42",
                error: null,
            },
            error: null,
        });

        const result = await runQueryFromSource("file:///test.jq", "40 + 2", wrapper);

        expect(sendRequest).toHaveBeenCalledWith({
            requestType: "run-query",
            body: Buffer.from("40 + 2", "utf8").toString("base64"),
            documentUri: "file:///test.jq",
        });
        expect(result.output).toBe("42");
    });
});
