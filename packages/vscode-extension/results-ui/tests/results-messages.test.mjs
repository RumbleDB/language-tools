import assert from "node:assert/strict";
import { test } from "node:test";

import { handleResultsMessage } from "../../src/views/results-message-handler.ts";

const request = (type, params) => ({ type, ...params });

test("export replies distinguish saved, cancelled, and failed operations", async () => {
    const replies = [];
    const calls = [];
    const handlers = {
        exportResults: async (message) => {
            calls.push(message);
            if (message.content === "fail") throw new Error("Disk is full");
            return { type: "EXPORT_RESULT", status: message.content ? "saved" : "cancelled" };
        },
        openErrorLocation: async () => {},
    };
    const respond = (message) => {
        replies.push(message);
    };
    await handleResultsMessage(
        request("EXPORT_RESULTS", { format: "csv", content: "data" }),
        handlers,
        respond,
    );
    await handleResultsMessage(
        request("EXPORT_RESULTS", { format: "sequence", content: "" }),
        handlers,
        respond,
    );
    await handleResultsMessage(
        request("EXPORT_RESULTS", { format: "csv", content: "fail" }),
        handlers,
        respond,
    );
    assert.equal(calls.length, 3);
    assert.deepEqual(replies, [
        { type: "EXPORT_RESULT", status: "saved" },
        { type: "EXPORT_RESULT", status: "cancelled" },
        { type: "EXPORT_RESULT", status: "error", message: "Disk is full" },
    ]);
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
