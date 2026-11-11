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
    function object(...names: string[]): TypeDefinition {
        return {
            kind: "object",
            fields: Object.fromEntries(
                names.map((name) => [name, { type: string, required: false }]),
            ),
        };
    }
    const user = object("avatar_url", "events_url", "followers_url", "login");
    const event: TypeDefinition = {
        kind: "object",
        fields: {
            id: { type: integer, required: true },
            actor: { type: user, required: false },
            repo: { type: object("name"), required: false },
            commits: { type: { kind: "array", content: user }, required: false },
            position: { type: { kind: "union", members: [user, nullType] }, required: false },
        },
    };

    it("puts each field on its own line and hides what is nested in a wide field", () => {
        expect(formatSequenceTypeExpanded({ itemType: event, arity: "*" })).toBe(
            [
                "{",
                "  id: xs:integer,",
                "  actor?: { … 4 fields },",
                "  repo?: { name?: xs:string },",
                "  commits?: [{ … 4 fields }],",
                "  position?: ({ … 4 fields } | js:null)",
                "}*",
            ].join("\n"),
        );
    });

    it("expands the object inside an array", () => {
        expect(
            formatSequenceTypeExpanded({ itemType: { kind: "array", content: user }, arity: "?" }),
        ).toBe(
            [
                "[{",
                "  avatar_url?: xs:string,",
                "  events_url?: xs:string,",
                "  followers_url?: xs:string,",
                "  login?: xs:string",
                "}]?",
            ].join("\n"),
        );
    });

    it("keeps a type that fits on one line as it is", () => {
        const small = { itemType: object("name", "url"), arity: "" };
        expect(formatSequenceTypeExpanded(small)).toBe(formatSequenceType(small));
        expect(summarizeSequenceType(small)).toBe(formatSequenceType(small));
    });

    it("summarizes a wide type on one line", () => {
        expect(summarizeSequenceType({ itemType: event, arity: "+" })).toBe("{ … 5 fields }+");
        expect(summarizeSequenceType({ itemType: object("a".repeat(80)), arity: "" })).toBe(
            "{ … 1 field }",
        );
    });
});
