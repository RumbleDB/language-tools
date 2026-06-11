import { findSignatureHelp } from "server/signature-help.js";
import { describe, expect, it } from "vitest";
import type { Position } from "vscode-languageserver";

import { positionAt, testDocument } from "./test-utils.js";

describe("JSONiq signature help", () => {
    describe("findSignatureHelp", () => {
        it("returns signature help for W3C builtin functions", async () => {
            const document = testDocument("sig-builtin", ['fn:substring("hello", 1, 2)']);

            // Cursor inside first argument
            const pos0 = positionAt(document, '"hello"');
            const help0 = await findSignatureHelp(document, pos0);

            expect(help0).not.toBeNull();
            expect(help0?.activeParameter).toBe(0);
            expect(help0?.signatures.length).toBeGreaterThan(0);
            expect(help0?.signatures[help0.activeSignature!]?.label).toContain("fn:substring");

            // Cursor inside third argument
            const pos2 = positionAt(document, "2");
            const help2 = await findSignatureHelp(document, pos2);

            expect(help2).not.toBeNull();
            expect(help2?.activeParameter).toBe(2);
            // fn:substring has overloads with 2 and 3 params. At activeParameter 2 (third param),
            // the active signature should be the one with 3 parameters.
            const activeSig = help2?.signatures[help2.activeSignature!];
            expect(activeSig?.parameters?.length).toBe(3);
        });

        it("returns null for incomplete calls without an AST function-call node", async () => {
            const document = testDocument("sig-incomplete", ['fn:substring("hello", ']);

            const pos: Position = { line: 0, character: 'fn:substring("hello", '.length };
            const help = await findSignatureHelp(document, pos);

            expect(help).toBeNull();
        });

        it("returns signature help for custom/source functions", async () => {
            const document = testDocument("sig-custom", [
                "declare function local:my-add($a, $b) {",
                "  $a + $b",
                "};",
                "local:my-add(1, 2)",
            ]);

            const pos = positionAt(document, "2");
            const help = await findSignatureHelp(document, pos);

            expect(help).not.toBeNull();
            expect(help?.activeParameter).toBe(1);
            expect(help?.signatures[0]?.label).toBe("local:my-add($a, $b)");
        });

        it("returns null when cursor is not in a function call", async () => {
            const document = testDocument("sig-null", ["declare variable $x := 10;"]);

            const pos = positionAt(document, "$x");
            const help = await findSignatureHelp(document, pos);

            expect(help).toBeNull();
        });
    });
});
