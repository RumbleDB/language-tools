import assert from "node:assert/strict";
import { test } from "node:test";

import { formatError } from "../src/utils/format-error.ts";

const range = { start: { line: 11, character: 7 }, end: { line: 11, character: 14 } };

test("copied errors retain the reported module and full source range", () => {
    assert.equal(
        formatError(
            {
                message: "Invalid value",
                code: "XPTY0004",
                location: "file:///modules/helper.xq",
                range,
            },
            "file:///query.jq",
        ),
        "Error Code: [XPTY0004]\nMessage: Invalid value\nFile: file:///modules/helper.xq\nPosition: Line 12, Column 8 (to 12:15)",
    );
});

test("the query fallback is not presented as a reported source location", () => {
    assert.equal(
        formatError(
            { message: "Server unavailable", code: null, location: null, range },
            "file:///query.jq",
        ),
        "Message: Server unavailable\nQuery: file:///query.jq",
    );
});
