import assert from "node:assert/strict";
import { test } from "node:test";

import { handleResultsMessage } from "../../src/views/results-message-handler.ts";

const request = (type, params) => ({ type, ...params });

test("export forwards both formats without sending a reply", async () => {
    const calls = [];
    const replies = [];
    const message = request("EXPORT_RESULTS", { csv: "csv data", sequence: "sequence data" });
    await handleResultsMessage(
        message,
        {
            exportResults: async (message) => {
                calls.push(message);
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
        exportResults: async () => {
            throw new Error("Unexpected export");
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
