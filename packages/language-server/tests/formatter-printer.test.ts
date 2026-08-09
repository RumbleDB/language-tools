import { concat, group, hardline, indent, line, text, verbatim } from "server/formatter/doc.js";
import { printDocToString } from "server/formatter/printer.js";
import { describe, expect, it } from "vitest";

const options = {
    indentSize: 2,
    maxLineWidth: 10,
    useTabs: false,
    blankLineBetweenDeclarations: true,
    insertFinalNewline: true,
} as const;

describe("document printer", () => {
    it("breaks a group when its continuation would otherwise overflow", () => {
        const doc = concat([group(concat([text("aaaa"), line, text("bbbb")])), text(" c")]);

        expect(printDocToString(doc, options)).toBe("aaaa\nbbbb c");
    });

    it("represents embedded newlines as hard lines", () => {
        const doc = concat([text("first\nsecond"), line, text("third")]);

        expect(printDocToString(doc, options)).toBe("first\nsecond\nthird");
    });

    it("uses tabs for indentation when requested", () => {
        const doc = group(concat([text("{"), indent(concat([line, text("x")])), line, text("}")]));

        expect(printDocToString(doc, { ...options, maxLineWidth: 1, useTabs: true })).toBe(
            "{\n\tx\n}",
        );
    });

    it("does not flatten a group containing a hard line", () => {
        const doc = group(concat([text("a"), hardline, text("b")]));

        expect(printDocToString(doc, options)).toBe("a\nb");
    });

    it("does not inject indentation into verbatim multiline text", () => {
        const doc = indent(concat([hardline, verbatim("first\n second")]));

        expect(printDocToString(doc, options)).toBe("\n  first\n second");
    });

    it("counts text before a verbatim newline when fitting a preceding group", () => {
        const doc = concat([group(concat([text("aaaa"), line, text("bbbb")])), verbatim(" c\n")]);

        expect(printDocToString(doc, options)).toBe("aaaa\nbbbb c\n");
    });
});
