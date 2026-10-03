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

test("presentation uses backend types, not string contents", async () => {
    const { itemTone, itemPreview, isExpandable } =
        await import("../src/utils/item-presentation.ts");
    const number = {
        ...atomic("xs:integer", "9007199254740993"),
        lexicalValue: "9007199254740993",
    };
    const string = {
        ...atomic("xs:string", '"9007199254740993"'),
        lexicalValue: "9007199254740993",
    };
    assert.equal(itemTone(number), "number");
    assert.equal(itemTone(string), "string");
    assert.equal(itemPreview(number), "9007199254740993");
    assert.equal(itemPreview(string), '"9007199254740993"');
    const xmlString = { ...atomic("xs:string", '"<book/>"'), lexicalValue: "<book/>" };
    assert.equal(isExpandable(xmlString), false);
    assert.equal(isExpandable({ kind: "node", type: "element", serialized: "<book/>" }), true);
    // A custom QName that happens to end in 'integer' is not a built-in integer type.
    assert.equal(itemTone({ ...number, typeName: "Q{urn:custom}integer" }), "value");
});

test("container summaries distinguish arrays, objects, maps, and functions", async () => {
    const { itemPreview, isExpandable } = await import("../src/utils/item-presentation.ts");
    assert.equal(
        itemPreview({ kind: "array", type: "array(*)", serialized: "[]", members: [] }),
        "[]",
    );
    const array = { kind: "array", type: "array(*)", serialized: "[()]", members: [[]] };
    assert.equal(itemPreview(array), "[()]");
    assert.equal(isExpandable(array), true);
    assert.equal(
        itemPreview({ kind: "object", type: "object", serialized: "map{}", entries: [] }),
        "{}",
    );
    assert.equal(
        itemPreview({ kind: "map", type: "map(*)", serialized: "map{}", entries: [] }),
        "map{}",
    );
    assert.equal(
        itemPreview({
            kind: "function",
            type: "function(*)",
            serialized: "fn:concat#2",
            function: { name: "fn:concat", arity: 2, signature: "function(*)" },
        }),
        "fn:concat#2",
    );
});

test("long strings remain complete when copied, and string-derived types retain quotes", async () => {
    const { itemPreview, isExpandable, itemTone } =
        await import("../src/utils/item-presentation.ts");
    const value = "x".repeat(500);
    const item = { ...atomic("xs:string", JSON.stringify(value)), lexicalValue: value };
    assert.equal(isExpandable(item), true);
    assert.equal(itemPreview(item), JSON.stringify(value));
    assert.equal(formatRawOutput([item]), JSON.stringify(value));
    const token = {
        ...atomic("xs:token", '"42"'),
        typeName: "Q{http://www.w3.org/2001/XMLSchema}token",
        lexicalValue: "42",
    };
    assert.equal(itemTone(token), "string");
    assert.equal(itemPreview(token), '"42"');
});

test("array previews preserve nested arrays and member sequence boundaries", async () => {
    const { itemPreview } = await import("../src/utils/item-presentation.ts");
    const array = (members) => ({ kind: "array", type: "array(*)", serialized: "array", members });
    const one = atomic("xs:integer", "1");
    const two = atomic("xs:integer", "2");
    assert.equal(itemPreview(array([[], [one, two], [array([[one]])]])), "[(), (1, 2), [1]]");
    assert.equal(itemPreview(array([[one], [two], [one], [two]])), "[1, 2, 1, …]");
    assert.equal(itemPreview(array([[array([[array([[one]])]])]])), "[[[…]]]");
});

test("object previews show fields and maps retain typed keys and sequence values", async () => {
    const { itemPreview } = await import("../src/utils/item-presentation.ts");
    const entries = [
        { key: key("a"), value: [atomic("xs:boolean", "true")] },
        { key: key("b"), value: [atomic("xs:boolean", "false")] },
    ];
    assert.equal(
        itemPreview({ kind: "object", type: "object", serialized: "map{}", entries }),
        '{"a": true, "b": false}',
    );
    assert.equal(
        itemPreview({
            kind: "map",
            type: "map(*)",
            serialized: "map{}",
            entries: [
                {
                    key: atomic("xs:integer", "1"),
                    value: [atomic("xs:integer", "1"), atomic("xs:integer", "2")],
                },
                { key: key("1"), value: [] },
            ],
        }),
        'map{1: (1, 2), "1": ()}',
    );
    const four = [...entries, { key: key("c"), value: [] }, { key: key("d"), value: [] }];
    assert.equal(
        itemPreview({ kind: "object", type: "object", serialized: "map{}", entries: four }),
        '{"a": true, "b": false, "c": (), …}',
    );
});

test("filtered exports follow sorted source indexes across pagination", async () => {
    const { createTable } = await import("@tanstack/solid-table");
    const { features } = await import("../src/model/table-features.ts");
    const { selectResultItems, serializeResultItems } =
        await import("../src/utils/result-items.ts");
    const items = Array.from({ length: 80 }, (_, index) =>
        key(`${index < 60 ? "keep" : "skip"}${String(index).padStart(2, "0")}`),
    );
    const table = createTable({
        features,
        data: items.map((item) => ({ name: [item] })),
        columns: [{ id: "name", accessorFn: (row) => row.name[0].lexicalValue }],
        state: {
            sorting: [{ id: "name", desc: true }],
            globalFilter: "keep",
            pagination: { pageIndex: 1, pageSize: 20 },
        },
    });
    assert.equal(table.getRowModel().rows.length, 20);
    const selected = selectResultItems(
        items,
        table.getSortedRowModel().rows.map((row) => row.index),
    );
    assert.equal(selected.length, 60);
    assert.equal(selected[0].lexicalValue, "keep59");
    assert.equal(selected.at(-1).lexicalValue, "keep00");
    assert.equal(serializeResultItems(selected).split("\n").length, 60);
});

test("serialization rejects errors instead of writing placeholder values", async () => {
    const { serializeResultItems } = await import("../src/utils/result-items.ts");
    const bad = { kind: "function", type: "function(*)", serialized: null };
    assert.throws(() => serializeResultItems([bad]), /cannot be serialized/);
});
