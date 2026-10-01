import {
    analyzeModule,
    collectModuleProlog,
    findSymbolAtPosition,
    type SchemaTypeDefinition,
} from "server/analysis/index.js";
import { ParserService } from "server/parser/index.js";
import { describe, expect, it } from "vitest";

import { positionAt, testDocumentFromUri } from "./test-utils.js";

const schemaTypes: SchemaTypeDefinition[] = ["Code", "Record"].map((localName) => ({
    kind: "type",
    origin: "schema",
    name: { namespaceUri: "urn:schema", localName },
}));
const parser = new ParserService();
const provider = { loadImport: () => [] };

describe("module-local XML Schema types", () => {
    it.each(["jsoniq", "xquery"])(
        "resolves aliases in annotations and type expressions in %s",
        (language) => {
            const document = testDocumentFromUri(
                [
                    'import schema namespace s = "urn:schema" at "types.xsd";',
                    'declare namespace alias = "urn:schema";',
                    "declare function local:f($x as alias:Record) as s:Code { $x };",
                    "1 instance of s:Record",
                ],
                {
                    uri: `file:///schema-types.${language === "xquery" ? "xq" : "jq"}`,
                    languageId: language,
                },
            );
            const { analysis } = analyzeModule(document, parser.parse(document).ast, {
                provider,
                schemaTypes,
            });
            expect(analysis.diagnostics).toEqual([]);
            // Complex types have no constructor, but must still resolve wherever a type name is expected.
            expect(
                findSymbolAtPosition(analysis, positionAt(document, "alias:Record"))?.declaration,
            ).toBe(schemaTypes[1]);
            expect(
                findSymbolAtPosition(analysis, positionAt(document, "s:Code"))?.declaration,
            ).toBe(schemaTypes[0]);
            expect(
                findSymbolAtPosition(analysis, positionAt(document, "s:Record"))?.declaration,
            ).toBe(schemaTypes[1]);
        },
    );

    it("keeps type and constructor resolution separate and forgets removed schema types", () => {
        const document = testDocumentFromUri(
            ['declare namespace s = "urn:schema";', '(1 instance of s:Code, s:Code("a"))'],
            { uri: "file:///schema-types-separate.jq" },
        );
        const ast = parser.parse(document).ast;
        const { analysis } = analyzeModule(document, ast, { provider, schemaTypes });
        // Registering a named type must not invent a constructor for it.
        expect(analysis.diagnostics.map((diagnostic) => diagnostic.code)).toEqual([
            "unresolved-function",
        ]);
        const removed = analyzeModule(document, ast, { provider }).analysis;
        expect(removed.diagnostics.map((diagnostic) => diagnostic.code)).toEqual([
            "unresolved-type",
            "unresolved-function",
        ]);
    });

    it("does not re-export imported schema types through a library module", () => {
        const library = testDocumentFromUri(
            [
                'module namespace lib = "urn:lib";',
                'import schema namespace s = "urn:schema" at "types.xsd";',
                "declare function lib:f($x as s:Record) { $x };",
            ],
            { uri: "file:///schema-types-library.jq" },
        );
        const libraryAst = parser.parse(library).ast;
        const prolog = collectModuleProlog(library.uri, libraryAst);
        expect(
            analyzeModule(library, libraryAst, { provider, prolog, schemaTypes }).analysis
                .diagnostics,
        ).toEqual([]);
        const main = testDocumentFromUri(
            [
                `import module namespace lib = "urn:lib" at "${library.uri}";`,
                'declare namespace s = "urn:schema";',
                "1 instance of s:Record",
            ],
            { uri: "file:///schema-types-main.jq" },
        );
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
        // A namespace binding in the importing module does not import the library's schema types.
        expect(analysis.diagnostics.map((diagnostic) => diagnostic.code)).toEqual([
            "unresolved-type",
        ]);
    });
});
