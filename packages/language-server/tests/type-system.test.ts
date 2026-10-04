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
            fields: {
                known: integer,
                optional: { kind: "union", members: [integer, nullType] },
                sequence: {
                    kind: "union",
                    members: [integer, { kind: "array", content: integer }, nullType],
                },
            },
        };

        expect(formatSequenceType({ itemType: type, arity: "*" })).toBe(
            "{ known: xs:integer, optional: (xs:integer | js:null), sequence: (xs:integer | [xs:integer] | js:null) }*",
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
                content: { kind: "object", fields: { value: integer } },
            }),
        ).toBe("[{ value: xs:integer }]");
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
