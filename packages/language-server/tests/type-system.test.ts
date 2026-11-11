import {
    formatSequenceType,
    formatSequenceTypeExpanded,
    formatTypeDefinition,
    summarizeSequenceType,
    type TypeDefinition,
} from "server/analysis/model/type-system.js";
import { describe, expect, it } from "vitest";

const integer: TypeDefinition = {
    kind: "named",
    name: { prefix: "xs", localName: "integer" },
};
const nullType: TypeDefinition = {
    kind: "named",
    name: { prefix: "js", localName: "null" },
};

describe("inferred object type formatting", () => {
    it("shows nullable fields and scalar/array alternatives", () => {
        const type: TypeDefinition = {
            kind: "object",
            displayName: "engine object description",
            fields: {
                known: { type: integer, required: true },
                nullable: { type: { kind: "union", members: [integer, nullType] }, required: true },
                sequence: {
                    type: {
                        kind: "union",
                        members: [integer, { kind: "array", content: integer }, nullType],
                    },
                    required: true,
                },
                missing: { type: integer, required: false },
            },
        };

        expect(formatSequenceType({ itemType: type, arity: "*" })).toBe(
            "{ known: xs:integer, nullable: (xs:integer | js:null), sequence: (xs:integer | [xs:integer] | js:null), missing?: xs:integer }*",
        );
    });

    it("keeps union cardinality separate from member types", () => {
        expect(
            formatSequenceType({
                itemType: { kind: "union", members: [integer, nullType] },
                arity: "+",
            }),
        ).toBe("(xs:integer | js:null)+");
    });

    it("preserves nested object content inside inferred arrays", () => {
        expect(
            formatTypeDefinition({
                kind: "array",
                content: { kind: "object", fields: { value: { type: integer, required: true } } },
            }),
        ).toBe("[{ value: xs:integer }]");
    });

    it("uses the engine display for types without a structured representation", () => {
        expect(
            formatTypeDefinition({ kind: "opaque", displayName: "map(xs:string, xs:integer?)" }),
        ).toBe("map(xs:string, xs:integer?)");
    });

    it("preserves the display of named array types", () => {
        expect(
            formatTypeDefinition({
                kind: "array",
                name: { prefix: "js", localName: "array" },
            }),
        ).toBe("js:array");
    });
});

describe("large inferred type formatting", () => {
    const string: TypeDefinition = { kind: "named", name: { prefix: "xs", localName: "string" } };
    function object(fields: Record<string, TypeDefinition>): TypeDefinition {
        return {
            kind: "object",
            fields: Object.fromEntries(
                Object.entries(fields).map(([name, type]) => [name, { type, required: false }]),
            ),
        };
    }
    function strings(...names: string[]): TypeDefinition {
        return object(Object.fromEntries(names.map((name) => [name, string])));
    }
    const user = strings("avatar_url", "events_url", "followers_url", "login");
    const event: TypeDefinition = {
        kind: "object",
        fields: {
            id: { type: integer, required: true },
            actor: { type: user, required: false },
            repo: { type: strings("name"), required: false },
            commits: { type: { kind: "array", content: user }, required: false },
            position: { type: { kind: "union", members: [user, nullType] }, required: false },
        },
    };

    it("expands nested objects that do not fit on their line", () => {
        expect(formatSequenceTypeExpanded({ itemType: event, arity: "*" })).toBe(
            [
                "{",
                "  id: xs:integer,",
                "  actor?: {",
                "    avatar_url?: xs:string,",
                "    events_url?: xs:string,",
                "    followers_url?: xs:string,",
                "    login?: xs:string",
                "  },",
                "  repo?: { name?: xs:string },",
                "  commits?: [{",
                "    avatar_url?: xs:string,",
                "    events_url?: xs:string,",
                "    followers_url?: xs:string,",
                "    login?: xs:string",
                "  }],",
                "  position?: ({",
                "    avatar_url?: xs:string,",
                "    events_url?: xs:string,",
                "    followers_url?: xs:string,",
                "    login?: xs:string",
                "  } | js:null)",
                "}*",
            ].join("\n"),
        );
    });

    it("summarizes nested objects on one line when expanding them takes too many lines", () => {
        const accounts = object(
            Object.fromEntries(Array.from({ length: 10 }, (_, index) => [`account${index}`, user])),
        );
        const lines = formatSequenceTypeExpanded({ itemType: accounts, arity: "" }).split("\n");
        expect(lines).toHaveLength(12);
        expect(lines[1]).toBe("  account0?: { avatar_url?, events_url?, followers_url?, login? },");
    });

    it("leaves out the fields that do not fit in a hover", () => {
        const table = strings(...Array.from({ length: 300 }, (_, index) => `column${index}`));
        const lines = formatSequenceTypeExpanded({ itemType: table, arity: "*" }).split("\n");
        expect(lines).toHaveLength(40);
        expect(lines.slice(-3)).toEqual(["  column36?: xs:string,", "  … 263 more fields", "}*"]);
    });

    it("keeps a type that fits on one line as it is", () => {
        const small = { itemType: strings("name", "url"), arity: "" };
        expect(formatSequenceTypeExpanded(small)).toBe(formatSequenceType(small));
        expect(summarizeSequenceType(small)).toBe(formatSequenceType(small));
    });

    it("hides nested objects before the types of fields in a summary", () => {
        expect(
            summarizeSequenceType({
                itemType: object({ name: string, owner: user }),
                arity: "?",
            }),
        ).toBe("{ name?: xs:string, owner?: {…} }?");
    });

    it("shows field names, then only the first of them, in a summary", () => {
        expect(summarizeSequenceType({ itemType: user, arity: "*" })).toBe(
            "{ avatar_url?, events_url?, followers_url?, login? }*",
        );
        expect(summarizeSequenceType({ itemType: user, arity: "*" }, 40)).toBe(
            "{ avatar_url?, events_url?, … 2 more }*",
        );
        expect(summarizeSequenceType({ itemType: strings("a".repeat(80)), arity: "" })).toBe(
            "{ … 1 field }",
        );
    });

    it("summarizes the objects inside arrays and unions", () => {
        expect(
            summarizeSequenceType({
                itemType: { kind: "union", members: [{ kind: "array", content: user }, nullType] },
                arity: "",
            }),
        ).toBe("([{ avatar_url?, events_url?, … 2 more }] | js:null)");
    });
});
