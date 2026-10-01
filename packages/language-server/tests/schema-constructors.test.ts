import {
    analyzeModule,
    collectModuleProlog,
    findSymbolAtPosition,
    getVisibleDeclarationsAtPosition,
    type SchemaConstructorDefinition,
} from "server/analysis/index.js";
import { ParserService } from "server/parser/index.js";
import { describe, expect, it } from "vitest";

import { positionAt, testDocument } from "./test-utils.js";

const constructor: SchemaConstructorDefinition = {
    kind: "function",
    origin: "schema",
    name: { qname: { namespaceUri: "urn:schema", localName: "Code" }, arity: 1 },
    signature: {
        parameterTypes: [
            {
                type: {
                    itemType: {
                        kind: "named",
                        name: {
                            namespaceUri: "http://www.w3.org/2001/XMLSchema",
                            localName: "anyAtomicType",
                        },
                    },
                    arity: "?",
                },
            },
        ],
        returnType: {
            itemType: { kind: "named", name: { namespaceUri: "urn:schema", localName: "Code" } },
            arity: "?",
        },
    },
};

describe("module-local schema constructors", () => {
    const parser = new ParserService();

    it("resolves calls and named references by expanded name while retaining the signature", () => {
        const document = testDocument("schema-constructor-aliases", [
            'import schema namespace s = "urn:schema";',
            'declare namespace alias = "urn:schema";',
            '(s:Code("a"), alias:Code("b"), s:Code#1)',
        ]);
        const { analysis } = analyzeModule(document, parser.parse(document).ast, {
            provider: { loadImport: () => [] },
            schemaConstructors: [constructor],
        });

        expect(analysis.diagnostics).toEqual([]);
        for (const name of ['s:Code("a")', 'alias:Code("b")', "s:Code#1"]) {
            expect(findSymbolAtPosition(analysis, positionAt(document, name))?.declaration).toBe(
                constructor,
            );
        }
        expect(getVisibleDeclarationsAtPosition(analysis, document.getText().length)).toContain(
            constructor,
        );
        expect(constructor.name.qname.prefix).toBeUndefined();
    });

    it.each(["s:Code()", "s:Code#2", 'other:Code("a")'])("does not resolve %s", (call) => {
        const document = testDocument(`schema-constructor-mismatch-${call}`, [
            'declare namespace s = "urn:schema";',
            'declare namespace other = "urn:other";',
            call,
        ]);
        const { analysis } = analyzeModule(document, parser.parse(document).ast, {
            provider: { loadImport: () => [] },
            schemaConstructors: [constructor],
        });
        expect(analysis.diagnostics.map((diagnostic) => diagnostic.code)).toEqual([
            "unresolved-function",
        ]);
        expect(
            findSymbolAtPosition(analysis, positionAt(document, call))?.declaration,
        ).toBeUndefined();
    });

    it("does not retain constructors across separate analyses", () => {
        const document = testDocument(
            "schema-constructor-reset",
            'declare namespace s = "urn:schema"; s:Code("a")',
        );
        const ast = parser.parse(document).ast;
        const provider = { loadImport: () => [] };
        expect(
            analyzeModule(document, ast, { provider, schemaConstructors: [constructor] }).analysis
                .diagnostics,
        ).toEqual([]);
        expect(
            analyzeModule(document, ast, { provider }).analysis.diagnostics.map(
                (diagnostic) => diagnostic.code,
            ),
        ).toEqual(["unresolved-function"]);
    });

    it("does not re-export constructors through a library-module import", () => {
        const library = testDocument("schema-constructor-library", [
            'module namespace lib = "urn:lib";',
            'import schema namespace s = "urn:schema";',
            'declare function lib:make() { s:Code("a") };',
        ]);
        const ast = parser.parse(library).ast;
        const prolog = collectModuleProlog(library.uri, ast);
        const { analysis: libraryAnalysis } = analyzeModule(library, ast, {
            provider: { loadImport: () => [] },
            prolog,
            schemaConstructors: [constructor],
        });
        expect(libraryAnalysis.diagnostics).toEqual([]);
        expect([...prolog.exports.keys()]).toEqual(["Q{urn:lib}make#0"]);

        const main = testDocument("schema-constructor-importer", [
            'import module namespace lib = "urn:lib" at "schema-constructor-library.jq";',
            'declare namespace s = "urn:schema";',
            '(lib:make(), s:Code("a"))',
        ]);
        const { analysis } = analyzeModule(main, parser.parse(main).ast, {
            provider: {
                loadImport: (_uri, imported) => [
                    {
                        locationUri: library.uri,
                        targetUri: library.uri,
                        range: imported.range,
                        prolog,
                    },
                ],
            },
        });
        expect(
            findSymbolAtPosition(analysis, positionAt(main, "lib:make()"))?.declaration?.origin,
        ).toBe("source");
        expect(
            findSymbolAtPosition(analysis, positionAt(main, 's:Code("a")'))?.declaration,
        ).toBeUndefined();
        expect(analysis.diagnostics.map((diagnostic) => diagnostic.code)).toEqual([
            "unresolved-function",
        ]);
    });
});
