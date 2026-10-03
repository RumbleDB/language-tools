import assert from "node:assert/strict";
import { test } from "node:test";

import { handleResultsMessage } from "../../src/views/results-message-handler.ts";

const request = (type, params) => ({ type, ...params });

test("open raw output forwards sequence without sending a reply", async () => {
    const calls = [];
    const replies = [];
    const message = request("OPEN_RAW_OUTPUT", { sequence: "sequence data" });
    await handleResultsMessage(
        message,
        {
            openRawOutput: async (message) => {
                calls.push(message);
            },
            rerunQuery: async () => {
                throw new Error("Unexpected rerun");
            },
            openErrorLocation: async () => {
                throw new Error("Unexpected navigation");
            },
        },
        (reply) => {
            replies.push(reply);
        },
    );
    assert.deepEqual(calls, [message]);
    assert.deepEqual(replies, []);
});

test("navigation routes the location and only replies on failure", async () => {
    const calls = [];
    const replies = [];
    const handlers = {
        rerunQuery: async () => {
            throw new Error("Unexpected rerun");
        },
        openRawOutput: async () => {
            throw new Error("Unexpected open raw output");
        },
        openErrorLocation: async (message) => {
            calls.push(message);
            if (message.location === "missing") throw new Error("Document unavailable");
        },
    };
    const respond = (message) => {
        replies.push(message);
    };
    const location = request("OPEN_ERROR_LOCATION", {
        location: "/query.jq",
        range: { start: { line: 0, character: 1 }, end: { line: 0, character: 2 } },
    });
    await handleResultsMessage(location, handlers, respond);
    assert.deepEqual(calls, [location]);
    assert.deepEqual(replies, []);
    await handleResultsMessage(
        request("OPEN_ERROR_LOCATION", { location: "missing" }),
        handlers,
        respond,
    );
    assert.deepEqual(replies, [
        { type: "OPEN_ERROR_LOCATION_ERROR", message: "Document unavailable" },
    ]);
});

test("rerun routes to the result panel's query handler", async () => {
    let reruns = 0;
    await handleResultsMessage(
        { type: "RERUN_QUERY" },
        {
            rerunQuery: async () => {
                reruns++;
            },
            openRawOutput: async () => {
                throw new Error("Unexpected open raw output");
            },
            openErrorLocation: async () => {
                throw new Error("Unexpected navigation");
            },
        },
        () => {
            throw new Error("Unexpected reply");
        },
    );
    assert.equal(reruns, 1);
});
