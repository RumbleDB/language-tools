import { collectModuleProlog } from "server/analysis/resolution/module-prolog.js";
import { ParserService } from "server/parser/index.js";
import { describe, expect, it } from "vitest";
import { TextDocument } from "vscode-languageserver-textdocument";

describe.each(["jsoniq", "xquery"])("%s schema imports", (language) => {
    function parse(source: string) {
        const extension = language === "jsoniq" ? "jq" : "xq";
        const document = TextDocument.create(
            `file:///schema-import.${extension}`,
            language,
            1,
            source,
        );
        const parsed = new ParserService().parse(document);
        expect(parsed.diagnostics).toEqual([]);
        const prolog = collectModuleProlog(document.uri, parsed.ast);
        const analysis = analyzeDocument(document, parsed.ast, { prolog });
        expect(analysis.diagnostics).toEqual([]);
        return { document, prolog, analysis };
    }

    it("retains the schema namespace, prefix, and location ranges", () => {
        const { document, prolog } = parse(
            'import schema namespace s = "urn:test" at "one.xsd", "two.xsd"; 1',
        );
        const imported = prolog.schemaImports[0]!;

        expect(imported.kind).toBe("schema-import");
        expect(imported.namespaceUri).toBe("urn:test");
        expect(document.getText(imported.namespaceUriRange)).toBe('"urn:test"');
        expect(imported.prefix).toBe("s");
        expect(document.getText(imported.prefixRange)).toBe("s");
        expect(imported.defaultElementNamespace).toBe(false);
        expect(imported.locations.map((location) => location.uri)).toEqual(["one.xsd", "two.xsd"]);
        expect(imported.locations.map((location) => document.getText(location.range))).toEqual([
            '"one.xsd"',
            '"two.xsd"',
        ]);
        expect(prolog.namespaces.get("s")?.namespaceUri).toBe("urn:test");
        expect(prolog.imports).toEqual([]);
    });

    it.each([
        ['import schema "urn:test" at "types.xsd"; 1', false, "urn:test"],
        ['import schema default element namespace "urn:test" at "types.xsd"; 1', true, "urn:test"],
        ['import schema default element namespace "" at "types.xsd"; 1', true, ""],
    ] as const)(
        "preserves an import without a prefix: %s",
        (source, defaultElementNamespace, namespaceUri) => {
            const { prolog } = parse(source);
            expect(prolog.schemaImports).toHaveLength(1);
            expect(prolog.schemaImports[0]).toMatchObject({
                kind: "schema-import",
                defaultElementNamespace,
                namespaceUri,
            });
            expect(prolog.schemaImports[0]?.prefix).toBeUndefined();
            expect(prolog.schemaImports[0]?.prefixRange).toBeUndefined();
            expect(prolog.namespaces.has("")).toBe(false);
        },
    );

    it("keeps ordinary namespace declarations separate", () => {
        const { prolog } = parse('declare namespace s = "urn:test"; 1');
        expect(prolog.schemaImports).toEqual([]);
        expect([...prolog.declarations.namespaces.keys()].map((node) => node.kind)).toEqual([
            "namespace-declaration",
        ]);
    });

    it("uses the imported prefix when resolving declared functions", () => {
        const { document, analysis } = parse(
            'import schema namespace s = "urn:test"; declare function s:f() { 1 }; s:f()',
        );
        const position = document.positionAt(document.getText().lastIndexOf("s:f"));
        expect(findSymbolAtPosition(analysis, position)?.declaration).toMatchObject({
            kind: "function",
            origin: "source",
            name: { qname: { namespaceUri: "urn:test", localName: "f", prefix: "s" } },
        });
    });
});
import { analyzeDocument, findSymbolAtPosition } from "server/analysis/index.js";
