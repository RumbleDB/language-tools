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

test("atomic previews and compact map keys preserve backend syntax", async () => {
    const { itemPreview } = await import("../src/utils/item-presentation.ts");
    const values = [
        { ...atomic("xs:boolean", "true()"), lexicalValue: "true" },
        { ...atomic("xs:date", 'xs:date("2026-10-03")'), lexicalValue: "2026-10-03" },
        { ...atomic("xs:float", 'xs:float("1.5")'), lexicalValue: "1.5" },
        { ...atomic("xs:double", "1.5e0"), lexicalValue: "1.5" },
        { ...atomic("xs:string", "'say \"hello\"'"), lexicalValue: 'say "hello"' },
        { ...atomic("xs:string", '"first\nsecond"'), lexicalValue: "first\nsecond" },
    ];
    for (const value of values) {
        assert.equal(itemPreview(value), value.serialized);
        assert.equal(itemPreview(value, false), value.serialized);
    }
    assert.equal(
        itemPreview({
            kind: "map",
            type: "map(*)",
            serialized: 'map{xs:date("2026-10-03"):(true(), \'say "hello"\')}',
            entries: [{ key: values[1], value: [values[0], values[4]] }],
        }),
        `map{xs:date("2026-10-03"): (true(), 'say "hello"')}`,
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
        { key: key("a"), value: [atomic("xs:boolean", "true()")] },
        { key: key("b"), value: [atomic("xs:boolean", "false()")] },
    ];
    assert.equal(
        itemPreview({ kind: "object", type: "object", serialized: "map{}", entries }),
        '{"a": true(), "b": false()}',
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
        '{"a": true(), "b": false(), "c": (), …}',
    );
});

test("full previews use backend serialization without changing quoting, whitespace, or types", async () => {
    const { itemPreview } = await import("../src/utils/item-presentation.ts");
    const serialized =
        'map{"a": "say ""hello""", "b": <p>first\n    second</p>, "c": [(), (1, 2)], "d": 9007199254740993}';
    const item = {
        kind: "map",
        type: "map(*)",
        serialized,
        entries: [
            { key: key("a"), value: [{ ...key('say "hello"'), serialized: '"say ""hello"""' }] },
        ],
    };
    assert.equal(itemPreview(item, false), serialized);
    assert.equal(itemPreview(item), 'map{"a": "say ""hello"""}');
    assert.equal(itemPreview(item.entries[0].value[0], false), '"say ""hello"""');
    assert.equal(itemPreview({ kind: "node", type: "text()", serialized: "" }, false), "");
    assert.equal(
        itemPreview(
            {
                kind: "atomic",
                type: "xs:date",
                serialized: 'xs:date("2026-10-03")',
                lexicalValue: "2026-10-03",
            },
            false,
        ),
        'xs:date("2026-10-03")',
    );
});

test("preview character limits preserve emoji and combining-character boundaries", async () => {
    const { truncatePreview, itemPreview } = await import("../src/utils/item-presentation.ts");
    for (const [limit, character] of [
        [32, "😀"],
        [40, "🇨🇭"],
        [120, "👩‍💻"],
        [32, "e\u0301"],
    ]) {
        const prefix = "a".repeat(limit - 1);
        assert.equal(truncatePreview(prefix + character + "tail", limit), `${prefix}…`);
        assert.equal(truncatePreview(character + "tail", limit), character + "tail");
        assert.equal(truncatePreview(prefix + "b", limit), prefix + "b");
    }
    const text = "a".repeat(38) + "😀";
    const item = {
        kind: "object",
        type: "object",
        serialized: `{"value": "${text}"}`,
        entries: [{ key: key("value"), value: [key(text)] }],
    };
    assert.equal(itemPreview(item), `{"value": "${"a".repeat(38)}…}`);
    assert.equal(itemPreview(item, false), `{"value": "${text}"}`);
    assert.equal(formatRawOutput([key(text)]), JSON.stringify(text));
    const node = { kind: "node", type: "element()", serialized: "a".repeat(39) + "😀" };
    assert.equal(
        itemPreview({ ...item, entries: [{ key: key("node"), value: [node] }] }),
        `{"node": ${"a".repeat(39)}…}`,
    );
});

test("filtered exports follow sorted source indexes across pagination", async () => {
    const { createTable } = await import("@tanstack/solid-table");
    const { features } = await import("../src/model/table-features.ts");
    const { selectResultItems } = await import("../src/utils/result-items.ts");
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
    assert.equal(formatRawOutput(selected).split("\n").length, 60);
});
