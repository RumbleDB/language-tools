import assert from "node:assert/strict";
import { test } from "node:test";

import { createTable, sortFn_alphanumeric } from "@tanstack/solid-table";

import { features } from "../src/model/table-features.ts";
import { isExpandable, itemPreview, truncatePreview } from "../src/utils/item-presentation.ts";
import {
    compareNumbers,
    compareNumericCells,
    fieldTypeLabel,
    formatCell,
    formatRawOutput,
    numericCellValue,
    projectTableRows,
    selectResultItems,
} from "../src/utils/result-items.ts";

const type = (displayName) => ({
    displayName,
    ...(displayName.startsWith("xs:")
        ? { qname: `Q{http://www.w3.org/2001/XMLSchema}${displayName.slice(3)}` }
        : {}),
});
const atomic = (displayName, serialized) => ({
    kind: "atomic",
    type: type(displayName),
    serialized,
});
const numeric = (displayName, number, serialized = number) => ({
    ...atomic(displayName, serialized),
    number,
});
const key = (value) => atomic("xs:string", JSON.stringify(value));

test("raw results preserve mixed items and numeric precision without a JSON envelope", () => {
    assert.equal(
        formatRawOutput([
            atomic("xs:integer", "9007199254740993"),
            atomic("xs:decimal", "0.12345678901234567890123456789"),
            atomic("xs:string", '"<book/>"'),
            { kind: "node", type: type("element"), nodeKind: "element", serialized: "<book/>" },
            { kind: "array", type: type("array(*)"), serialized: "[(),(1,2)]", members: [[], []] },
        ]),
        '9007199254740993\n0.12345678901234567890123456789\n"<book/>"\n<book/>\n[(),(1,2)]',
    );
});

test("empty sequence, missing field, null, empty string, and empty array stay distinct", () => {
    assert.equal(formatRawOutput([]), "()");
    assert.equal(formatCell(undefined), "—");
    assert.equal(formatCell([]), "()");
    assert.equal(formatCell([{ kind: "null", type: type("js:null"), serialized: "null" }]), "null");
    assert.equal(formatCell([atomic("xs:string", '""')]), '""');
    assert.equal(
        formatCell([{ kind: "array", type: type("array(*)"), serialized: "[]", members: [] }]),
        "[]",
    );
});

test("mixed objects and scalars are retained whole in the value column", () => {
    const object = {
        kind: "object",
        type: type("object"),
        serialized: 'map{"name":"Ada"}',
        fields: [],
    };
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
        type: type("object"),
        serialized: "map{}",
        fields: [
            { name: "a.b", value },
            { name: "__proto__", value },
            { name: "__index", value },
            { name: "toString", value },
        ],
    };
    const second = { kind: "object", type: type("object"), serialized: "map{}", fields: [] };
    const projection = projectTableRows([first, second]);
    assert.equal(projection.objects, true);
    for (const name of ["a.b", "__proto__", "__index", "toString"]) {
        assert.equal(projection.rows[0][name], value);
        assert.equal(projection.rows[1][name], undefined);
    }
});

test("field type labels mark optional fields and need an object result type", () => {
    const objectType = {
        kind: "object",
        displayName: "{ a: xs:decimal, b?: xs:string }",
        fields: {
            a: { type: type("xs:decimal"), required: true },
            b: { type: type("xs:string"), required: false },
        },
    };
    assert.equal(fieldTypeLabel(objectType, "a"), "xs:decimal");
    assert.equal(fieldTypeLabel(objectType, "b"), "xs:string?");
    assert.equal(fieldTypeLabel(objectType, "c"), undefined);
    assert.equal(fieldTypeLabel(type("item"), "a"), undefined);
    assert.equal(fieldTypeLabel(undefined, "a"), undefined);
});

test("presentation preserves backend serialization and expansion behavior", () => {
    const number = {
        ...atomic("xs:integer", "9007199254740993"),
    };
    const string = {
        ...atomic("xs:string", '"9007199254740993"'),
    };
    assert.equal(itemPreview(number), "9007199254740993");
    assert.equal(itemPreview(string), '"9007199254740993"');
    const xmlString = { ...atomic("xs:string", '"<book/>"') };
    assert.equal(isExpandable(xmlString), false);
    assert.equal(
        isExpandable({
            kind: "node",
            type: type("element"),
            nodeKind: "element",
            serialized: "<book/>",
        }),
        true,
    );
});

test("container summaries distinguish arrays, objects, maps, and functions", () => {
    assert.equal(
        itemPreview({ kind: "array", type: type("array(*)"), serialized: "[]", members: [] }),
        "[]",
    );
    const array = { kind: "array", type: type("array(*)"), serialized: "[()]", members: [[]] };
    assert.equal(itemPreview(array), "[()]");
    assert.equal(isExpandable(array), true);
    assert.equal(
        itemPreview({ kind: "object", type: type("object"), serialized: "map{}", fields: [] }),
        "{}",
    );
    assert.equal(
        itemPreview({ kind: "map", type: type("map(*)"), serialized: "map{}", entries: [] }),
        "map{}",
    );
    assert.equal(
        itemPreview({
            kind: "function",
            type: type("function(*)"),
            serialized: "fn:concat#2",
            name: "fn:concat",
            arity: 2,
            signature: "function(*)",
        }),
        "fn:concat#2",
    );
});

test("atomic previews and compact map keys preserve backend syntax", () => {
    const values = [
        { ...atomic("xs:boolean", "true()") },
        { ...atomic("xs:date", 'xs:date("2026-10-03")') },
        { ...atomic("xs:float", 'xs:float("1.5")') },
        { ...atomic("xs:double", "1.5e0") },
        { ...atomic("xs:string", "'say \"hello\"'") },
        { ...atomic("xs:string", '"first\nsecond"') },
    ];
    for (const value of values) {
        assert.equal(itemPreview(value), value.serialized);
        assert.equal(formatRawOutput([value]), value.serialized);
    }
    assert.equal(
        itemPreview({
            kind: "map",
            type: type("map(*)"),
            serialized: 'map{xs:date("2026-10-03"):(true(), \'say "hello"\')}',
            entries: [{ key: values[1], value: [values[0], values[4]] }],
        }),
        `map{xs:date("2026-10-03"): (true(), 'say "hello"')}`,
    );
});

test("long strings remain complete when copied, and string-derived types retain quotes", () => {
    const value = "x".repeat(500);
    const item = { ...atomic("xs:string", JSON.stringify(value)) };
    // Atomic disclosure depends on measured clipping, not a character count.
    assert.equal(isExpandable(item), false);
    assert.equal(itemPreview(item), JSON.stringify(value));
    assert.equal(formatRawOutput([item]), JSON.stringify(value));
    const token = {
        ...atomic("xs:token", '"42"'),
    };
    assert.equal(itemPreview(token), '"42"');
});

test("array previews preserve nested arrays and member sequence boundaries", () => {
    const array = (members) => ({
        kind: "array",
        type: type("array(*)"),
        serialized: "array",
        members,
    });
    const one = atomic("xs:integer", "1");
    const two = atomic("xs:integer", "2");
    assert.equal(itemPreview(array([[], [one, two], [array([[one]])]])), "[(), (1, 2), [1]]");
    assert.equal(itemPreview(array([[one], [two], [one], [two]])), "[1, 2, 1, …]");
    assert.equal(itemPreview(array([[array([[array([[one]])]])]])), "[[[…]]]");
});

test("object previews show fields and maps retain typed keys and sequence values", () => {
    const fields = [
        { name: "a", value: [atomic("xs:boolean", "true()")] },
        { name: "b", value: [atomic("xs:boolean", "false()")] },
    ];
    assert.equal(
        itemPreview({ kind: "object", type: type("object"), serialized: "map{}", fields }),
        '{"a": true(), "b": false()}',
    );
    assert.equal(
        itemPreview({
            kind: "map",
            type: type("map(*)"),
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
    const four = [...fields, { name: "c", value: [] }, { name: "d", value: [] }];
    assert.equal(
        itemPreview({ kind: "object", type: type("object"), serialized: "map{}", fields: four }),
        '{"a": true(), "b": false(), "c": (), …}',
    );
});

test("raw exports use backend serialization without changing quoting, whitespace, or types", () => {
    const serialized =
        'map{"a": "say ""hello""", "b": <p>first\n    second</p>, "c": [(), (1, 2)], "d": 9007199254740993}';
    const item = {
        kind: "map",
        type: type("map(*)"),
        serialized,
        entries: [
            { key: key("a"), value: [{ ...key('say "hello"'), serialized: '"say ""hello"""' }] },
        ],
    };
    assert.equal(formatRawOutput([item]), serialized);
    assert.equal(itemPreview(item), 'map{"a": "say ""hello"""}');
    assert.equal(formatRawOutput([item.entries[0].value[0]]), '"say ""hello"""');
    assert.equal(
        formatRawOutput([{ kind: "node", type: type("text()"), nodeKind: "text", serialized: "" }]),
        "",
    );
    assert.equal(
        formatRawOutput([
            {
                kind: "atomic",
                type: type("xs:date"),
                serialized: 'xs:date("2026-10-03")',
            },
        ]),
        'xs:date("2026-10-03")',
    );
});

test("preview character limits preserve emoji and combining-character boundaries", () => {
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
        type: type("object"),
        serialized: `{"value": "${text}"}`,
        fields: [{ name: "value", value: [key(text)] }],
    };
    assert.equal(itemPreview(item), `{"value": "${"a".repeat(38)}…}`);
    assert.equal(formatRawOutput([item]), `{"value": "${text}"}`);
    assert.equal(formatRawOutput([key(text)]), JSON.stringify(text));
    const node = {
        kind: "node",
        type: type("element()"),
        nodeKind: "element",
        serialized: "a".repeat(39) + "😀",
    };
    assert.equal(
        itemPreview({ ...item, fields: [{ name: "node", value: [node] }] }),
        `{"node": ${"a".repeat(39)}…}`,
    );
});

test("filtered exports follow sorted source indexes across pagination", () => {
    const items = Array.from({ length: 80 }, (_, index) =>
        key(`${index < 60 ? "keep" : "skip"}${String(index).padStart(2, "0")}`),
    );
    const table = createTable({
        features,
        data: items.map((item) => ({ name: [item] })),
        columns: [{ id: "name", accessorFn: (row) => row.name[0].serialized }],
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
    assert.equal(selected[0].serialized, '"keep59"');
    assert.equal(selected.at(-1).serialized, '"keep00"');
    assert.equal(formatRawOutput(selected).split("\n").length, 60);
});

test("numbers sort by exact value, with NaN and infinities at the ends", () => {
    const numbers = [
        "1500",
        "1.25",
        "INF",
        "9007199254740993",
        "-3",
        "1.5",
        "NaN",
        "9007199254740992",
        "-0",
        "-0.5",
        "1.0E-11",
        "-INF",
    ];
    assert.deepEqual(numbers.sort(compareNumbers), [
        "NaN",
        "-INF",
        "-3",
        "-0.5",
        "-0",
        "1.0E-11",
        "1.25",
        "1.5",
        "1500",
        "9007199254740992",
        "9007199254740993",
        "INF",
    ]);
    assert.equal(compareNumbers("0", "-0"), 0);
});

test("other cells stay after numbers when sorting in either direction", () => {
    const cells = [[numeric("xs:integer", "1")], [key("x")], [numeric("xs:integer", "3")], []];
    const sortedCells = (desc) =>
        createTable({
            features,
            data: cells,
            columns: [
                {
                    id: "value",
                    accessorFn: formatCell,
                    sortFn: (rowA, rowB, columnId) =>
                        compareNumericCells(rowA.original, rowB.original, desc) ??
                        sortFn_alphanumeric(rowA, rowB, columnId),
                },
            ],
            state: { sorting: [{ id: "value", desc }] },
        })
            .getSortedRowModel()
            .rows.map((row) => formatCell(row.original));
    assert.deepEqual(sortedCells(false), ["1", "3", '"x"', "()"]);
    assert.deepEqual(sortedCells(true), ["3", "1", "()", '"x"']);
});

test("only a cell holding a single number has a numeric value", () => {
    assert.equal(numericCellValue([numeric("xs:float", "1.5", 'xs:float("1.5")')]), "1.5");
    assert.equal(numericCellValue([atomic("xs:string", '"1"')]), undefined);
    assert.equal(
        numericCellValue([numeric("xs:integer", "1"), numeric("xs:integer", "2")]),
        undefined,
    );
});
