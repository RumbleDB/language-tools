import {
    runQuery,
    runQueryFromSource,
} from "server/integrations/rumble/operations/run-query/service.js";
import type { RunQueryItem } from "server/lsp/protocol/requests/run-query.js";
import { describe, expect, it, vi } from "vitest";

import { createMockWrapperClient, testDocument } from "./test-utils.js";

describe("run query service", () => {
    it("preserves typed mixed items without coercing serialized values", async () => {
        const items: RunQueryItem[] = [
            {
                kind: "atomic",
                type: {
                    displayName: "xs:integer",
                    qname: "Q{http://www.w3.org/2001/XMLSchema}integer",
                },
                serialized: "9007199254740993",
            },
            {
                kind: "node",
                type: { displayName: "element" },
                nodeKind: "element",
                serialized: "<book/>",
            },
            { kind: "array", type: { displayName: "array(*)" }, serialized: "[()]", members: [[]] },
            { kind: "null", type: { displayName: "js:null" }, serialized: "null" },
            {
                kind: "object",
                type: { displayName: "object" },
                serialized: '{"a.b": 1}',
                fields: [{ name: "a.b", value: [] }],
            },
            {
                kind: "map",
                type: { displayName: "map(*)" },
                serialized: "map{1: ()}",
                entries: [
                    {
                        key: {
                            kind: "atomic",
                            type: { displayName: "xs:integer" },
                            serialized: "1",
                        },
                        value: [],
                    },
                ],
            },
            {
                kind: "function",
                type: { displayName: "function(*)" },
                serialized: "fn:concat#2",
                name: "fn:concat",
                arity: 2,
                signature: "function(*)",
            },
        ];
        const body = { error: null, items };
        const wrapper = createMockWrapperClient({
            sendRequest: vi.fn().mockResolvedValue({ body }),
        });
        const result = await runQueryFromSource("file:///test.xq", "mixed result", wrapper);
        expect(result).toEqual(body);
        expect(result.items?.[0]?.serialized).toBe("9007199254740993");
    });

    it("sends document text and documentUri to wrapper", async () => {
        const sendRequest = vi.fn().mockResolvedValue({
            id: 1,
            responseType: "run-query",
            body: {
                items: [{ kind: "atomic", type: { displayName: "xs:integer" }, serialized: "2" }],
                error: null,
            },
            error: null,
        });
        const wrapper = createMockWrapperClient({ sendRequest });
        const document = testDocument("run-query-test", "1 + 1");

        const result = await runQuery(document, wrapper);

        expect(sendRequest).toHaveBeenCalledWith(
            {
                requestType: "run-query",
                body: Buffer.from("1 + 1", "utf8").toString("base64"),
                documentUri: document.uri,
            },
            undefined,
            undefined,
        );
        expect(result.items?.[0]?.serialized).toBe("2");
        expect(result.error).toBeNull();
    });

    it("handles error response from wrapper", async () => {
        const wrapper = createMockWrapperClient({
            sendRequest: vi.fn().mockRejectedValue(new Error("Syntax error")),
        });
        const document = testDocument("run-query-error-test", "1 +");

        const result = await runQuery(document, wrapper);

        expect(result.items).toBeNull();
        expect(result.error).toEqual({
            message: "Syntax error",
            code: null,
            location: null,
            range: null,
        });
    });

    it("preserves query error codes and source ranges from the wrapper", async () => {
        const error = {
            message: "Division by zero",
            code: "FOAR0001",
            location: "file:///library.jq",
            range: { start: { line: 2, character: 4 }, end: { line: 2, character: 12 } },
        };
        const wrapper = createMockWrapperClient({
            sendRequest: vi.fn().mockResolvedValue({ body: { items: null, error } }),
        });
        const result = await runQueryFromSource("file:///test.jq", "1 div 0", wrapper);
        expect(result).toEqual({ items: null, error });
    });

    it("rejects a missing URI even when source is provided", async () => {
        const wrapper = createMockWrapperClient({ sendRequest: vi.fn() });
        // Exercise malformed input from a client that bypasses the TypeScript contract.
        const result = await runQueryFromSource(undefined as unknown as string, "1", wrapper);
        expect(result.error).toEqual({
            message: "A document URI is required for run-query.",
            code: null,
            location: null,
            range: null,
        });
        expect(wrapper.sendRequest).not.toHaveBeenCalled();
    });

    it("preserves untitled document URIs", async () => {
        const wrapper = createMockWrapperClient({
            sendRequest: vi.fn().mockResolvedValue({ body: { items: [], error: null } }),
        });
        await runQueryFromSource("untitled:Untitled-1", "()", wrapper);
        expect(wrapper.sendRequest).toHaveBeenCalledWith(
            expect.objectContaining({ documentUri: "untitled:Untitled-1" }),
            undefined,
            undefined,
        );
    });

    it("allows running query directly from source and URI", async () => {
        const sendRequest = vi.fn().mockResolvedValue({
            id: 2,
            responseType: "run-query",
            body: {
                items: [{ kind: "atomic", type: { displayName: "xs:integer" }, serialized: "42" }],
                error: null,
            },
            error: null,
        });
        const wrapper = createMockWrapperClient({ sendRequest });

        const result = await runQueryFromSource("file:///test.jq", "40 + 2", wrapper);

        expect(sendRequest).toHaveBeenCalledWith(
            {
                requestType: "run-query",
                body: Buffer.from("40 + 2", "utf8").toString("base64"),
                documentUri: "file:///test.jq",
            },
            undefined,
            undefined,
        );
        expect(result.items?.[0]?.serialized).toBe("42");
    });

    it("returns an error result when an already-aborted signal is passed", async () => {
        const controller = new AbortController();
        controller.abort();

        const sendRequest = vi.fn().mockImplementation(
            (_payload: unknown, _timeout: unknown, signal: AbortSignal) =>
                new Promise((_resolve, reject) => {
                    if (signal.aborted) {
                        reject(
                            signal.reason instanceof Error
                                ? signal.reason
                                : new Error("Run-query was cancelled."),
                        );
                        return;
                    }
                    signal.addEventListener("abort", () =>
                        reject(
                            signal.reason instanceof Error
                                ? signal.reason
                                : new Error("Run-query was cancelled."),
                        ),
                    );
                }),
        );
        const wrapper = createMockWrapperClient({ sendRequest });

        const result = await runQueryFromSource("file:///test.jq", "1", wrapper, controller.signal);

        expect(result.items).toBeNull();
        expect(result.error?.message).toBe("This operation was aborted");
    });

    it("returns an error result when the signal is aborted mid-flight", async () => {
        const controller = new AbortController();

        const sendRequest = vi.fn().mockImplementation(
            (_payload: unknown, _timeout: unknown, signal: AbortSignal) =>
                new Promise((_resolve, reject) => {
                    signal.addEventListener("abort", () =>
                        reject(
                            signal.reason instanceof Error
                                ? signal.reason
                                : new Error("Run-query was cancelled."),
                        ),
                    );
                }),
        );
        const wrapper = createMockWrapperClient({ sendRequest });

        const resultPromise = runQueryFromSource(
            "file:///test.jq",
            "1",
            wrapper,
            controller.signal,
        );
        controller.abort();
        const result = await resultPromise;

        expect(result.items).toBeNull();
        expect(result.error?.message).toBe("This operation was aborted");
    });
});
