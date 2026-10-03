import assert from "node:assert/strict";
import { test } from "node:test";

import { errorSourceLines } from "../../src/error-source.ts";

test("source excerpt highlights the exact token and preserves CRLF lines", () => {
    const lines = errorSourceLines("first\r\nreturn bad + 1\r\nlast", {
        start: { line: 1, character: 7 },
        end: { line: 1, character: 10 },
    });
    assert.deepEqual(lines[1], {
        number: 2,
        highlighted: true,
        before: "return ",
        selected: "bad",
        after: " + 1",
    });
    assert.equal(lines[0].before, "first");
});
test("multiline ranges exclude the line at an end position of column zero", () => {
    const lines = errorSourceLines("abc\ndef\nghi", {
        start: { line: 0, character: 1 },
        end: { line: 2, character: 0 },
    });
    assert.deepEqual(
        lines.map((line) => line.selected),
        ["bc", "def", ""],
    );
    assert.equal(lines[2].highlighted, false);
});
test("missing snapshots or locations do not produce misleading previews", () => {
    const range = { start: { line: 0, character: 0 }, end: { line: 0, character: 1 } };
    assert.deepEqual(errorSourceLines(undefined, range), []);
    assert.deepEqual(errorSourceLines("query", null), []);
    assert.deepEqual(errorSourceLines("query", { ...range, start: { line: 5, character: 0 } }), []);
});
test("long ranges keep the source excerpt bounded", () => {
    const lines = errorSourceLines(Array(100).fill("line").join("\n"), {
        start: { line: 30, character: 0 },
        end: { line: 90, character: 4 },
    });
    assert.equal(lines.length, 15);
    assert.equal(lines[0].number, 28);
});
