import assert from "node:assert/strict";
import { test } from "node:test";

import { formatCell, formatRawOutput, projectTableRows } from "../src/utils/result-items.ts";

const atomic = (type, serialized) => ({ kind: "atomic", type, serialized });
const key = (lexicalValue) => ({
    ...atomic("xs:string", JSON.stringify(lexicalValue)),
    lexicalValue,
});

test("raw results preserve mixed items and numeric precision without a JSON envelope", () => {
    assert.equal(
        formatRawOutput([
            atomic("xs:integer", "9007199254740993"),
            atomic("xs:decimal", "0.12345678901234567890123456789"),
            atomic("xs:string", '"<book/>"'),
            { kind: "node", type: "element", serialized: "<book/>" },
            { kind: "array", type: "array(*)", serialized: "[(),(1,2)]", members: [[], []] },
        ]),
        '9007199254740993\n0.12345678901234567890123456789\n"<book/>"\n<book/>\n[(),(1,2)]',
    );
});

test("empty sequence, missing field, null, empty string, and empty array stay distinct", () => {
    assert.equal(formatRawOutput([]), "()");
    assert.equal(formatCell(undefined), "—");
    assert.equal(formatCell([]), "()");
    assert.equal(formatCell([{ kind: "null", type: "js:null", serialized: "null" }]), "null");
    assert.equal(formatCell([atomic("xs:string", '""')]), '""');
    assert.equal(
        formatCell([{ kind: "array", type: "array(*)", serialized: "[]", members: [] }]),
        "[]",
    );
});

test("mixed objects and scalars are retained whole in the value column", () => {
    const object = { kind: "object", type: "object", serialized: 'map{"name":"Ada"}', entries: [] };
    const items = [object, atomic("xs:integer", "42")];
    const projection = projectTableRows(items);
    assert.equal(projection.objects, false);
    assert.deepEqual(
        projection.rows.map((row) => row.value[0]),
        items,
    );
});

test("object projection preserves literal field names and does not inherit missing values", () => {
    const value = [atomic("xs:integer", "9007199254740993")];
    const first = {
        kind: "object",
        type: "object",
        serialized: "map{}",
        entries: [
            { key: key("a.b"), value },
            { key: key("__proto__"), value },
            { key: key("__index"), value },
            { key: key("toString"), value },
        ],
    };
    const second = { kind: "object", type: "object", serialized: "map{}", entries: [] };
    const projection = projectTableRows([first, second]);
    assert.equal(projection.objects, true);
    for (const name of ["a.b", "__proto__", "__index", "toString"]) {
        assert.equal(projection.rows[0][name], value);
        assert.equal(projection.rows[1][name], undefined);
    }
});

test("serialization errors are visible instead of silently becoming null", () => {
    assert.equal(
        formatRawOutput([
            {
                kind: "function",
                type: "function(*)",
                serialized: null,
                serializationError: "Unavailable",
            },
        ]),
        "[function(*): Unavailable]",
    );
});
