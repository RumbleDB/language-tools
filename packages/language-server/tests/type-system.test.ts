import {
    formatSequenceType,
    formatTypeDefinition,
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
