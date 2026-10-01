import {
    analyzeModule,
    collectModuleProlog,
    findSymbolAtPosition,
    getVisibleDeclarationsAtPosition,
    type SchemaConstructorDefinition,
} from "server/analysis/index.js";
import { createServerContext } from "server/app/context.js";
import { findHover } from "server/lsp/features/hover.js";
import { findSignatureHelp } from "server/lsp/features/signature-help.js";
import { ParserService } from "server/parser/index.js";
import { describe, expect, it, vi } from "vitest";
import type { Connection } from "vscode-languageserver/node";

import {
    createMockWrapperClient,
    positionAt,
    testDocument,
    testDocumentFromUri,
} from "./test-utils.js";

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

describe("schema constructor signature help", () => {
    it.each([
        ["jsoniq", 'alias:Code("a")', "alias:Code"],
        ["xquery", 'alias:Code("a")', "alias:Code"],
        ["jsoniq", "s:Code(", "s:Code"],
        ["xquery", "s:Code(", "s:Code"],
        ["xquery", "Q{urn:schema}Code(", "Q{urn:schema}Code"],
        ["jsoniq", "other:Code(", "other:Code"],
    ])("shows the constructor signature for %s %s", async (language, call, name) => {
        const wrapper = createMockWrapperClient({
            sendRequest: vi.fn().mockResolvedValue({
                id: 1,
                responseType: "schema-catalog",
                body: {
                    types: [constructor.name.qname],
                    constructors: [{ name: constructor.name, signature: constructor.signature }],
                    errors: [],
                },
                error: null,
            }),
        });
        const { workspace } = createServerContext({} as Connection, wrapper);
        const document = testDocumentFromUri(
            [
                'import schema namespace s = "urn:schema" at "types.xsd";',
                'declare namespace alias = "urn:schema";',
                'declare namespace other = "urn:other";',
                call,
            ],
            {
                uri: `file:///schema-signature.${language === "xquery" ? "xq" : "jq"}`,
                languageId: language,
            },
        );
        // Trigger help immediately after '('; no argument is required to discover the signature.
        const position = document.positionAt(document.getText().indexOf(call) + name.length + 1);
        const help = await findSignatureHelp(document, position, workspace);
        if (name === "other:Code") {
            // Matching the local name alone must not borrow a constructor from another namespace.
            expect(help?.signatures).toEqual([{ label: "other:Code(...)", parameters: [] }]);
            return;
        }
        expect(help).toMatchObject({
            activeParameter: 0,
            activeSignature: 0,
            signatures: [
                {
                    label: `${name}($arg1 as anyAtomicType?) as Code?`,
                    parameters: [{ label: "$arg1 as anyAtomicType?" }],
                },
            ],
        });
        if (call.endsWith("(")) {
            // Tolerant editor help must not make an incomplete call semantically valid.
            expect(
                (await workspace.getAnalysis(document)).diagnostics.map(
                    (diagnostic) => diagnostic.code,
                ),
            ).toContain("unresolved-function");
        }
    });
});

describe("schema constructor hover", () => {
    it.each([
        ["jsoniq", 's:Code("a")', "s:Code"],
        ["xquery", 's:Code("a")', "s:Code"],
        ["jsoniq", "alias:Code#1", "alias:Code"],
        ["xquery", "alias:Code#1", "alias:Code"],
        ["jsoniq", 'Q{urn:schema}Code("a")', "Q{urn:schema}Code"],
        ["xquery", 'Q{urn:schema}Code("a")', "Q{urn:schema}Code"],
    ])(
        "shows the catalog signature for %s %s even without type inference",
        async (language, call, name) => {
            const sendRequest = vi.fn((request: { requestType: string }) => {
                if (request.requestType !== "schema-catalog")
                    throw new Error("Type inference unavailable");
                return Promise.resolve({
                    id: 1,
                    responseType: "schema-catalog",
                    body: {
                        types: [constructor.name.qname],
                        constructors: [
                            { name: constructor.name, signature: constructor.signature },
                        ],
                        errors: [],
                    },
                    error: null,
                });
            });
            const wrapper = createMockWrapperClient({ sendRequest });
            const { workspace } = createServerContext({} as Connection, wrapper);
            const document = testDocumentFromUri(
                [
                    'import schema namespace s = "urn:schema" at "types.xsd";',
                    'declare namespace alias = "urn:schema";',
                    call,
                ],
                {
                    uri: `file:///schema-hover.${language === "xquery" ? "xq" : "jq"}`,
                    languageId: language,
                },
            );
            // The catalog supplies the signature; a failed type-at-position request must not hide it.
            const hover = await findHover(document, positionAt(document, call), workspace, wrapper);
            expect(hover?.contents).toEqual({
                kind: "markdown",
                value: `\`\`\`jsoniq\n${name}(anyAtomicType?) as Code?\n\`\`\``,
            });
            expect(hover?.range?.start).toEqual(positionAt(document, call));
            // Preserve the call site's prefix (or expanded QName) without changing the canonical definition.
            expect(constructor.name.qname.prefix).toBeUndefined();
        },
    );
});
