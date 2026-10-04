import { createServerContext } from "server/app/context.js";
import type { SchemaCatalogWireResult } from "server/integrations/rumble/operations/schema-catalog/protocol.js";
import { findCompletions } from "server/lsp/features/completion.js";
import { describe, expect, it, vi } from "vitest";
import { CompletionItemKind, InsertTextFormat, type Connection } from "vscode-languageserver/node";

import { createMockWrapperClient, testDocumentFromUri } from "./test-utils.js";

const qname = { namespaceUri: "urn:test", localName: "Code" };
const catalog: SchemaCatalogWireResult = {
    // Record is a named complex type: it belongs in type completion, but has no constructor.
    types: [{ name: qname }, { name: { namespaceUri: "urn:test", localName: "Record" } }],
    constructors: [
        {
            name: { qname, arity: 1 },
            signature: {
                parameterTypes: [
                    {
                        type: {
                            itemType: {
                                kind: "named",
                                name: {
                                    namespaceUri: "http://www.w3.org/2001/XMLSchema",
                                    prefix: "xs",
                                    localName: "anyAtomicType",
                                },
                            },
                            arity: "?",
                        },
                    },
                ],
                returnType: { itemType: { kind: "named", name: qname }, arity: "?" },
            },
        },
    ],
    errors: [],
};

async function complete(source: string, language: string, result = catalog) {
    const sendRequest = vi
        .fn()
        .mockResolvedValue({ id: 1, responseType: "schema-catalog", body: result, error: null });
    const wrapper = createMockWrapperClient({ sendRequest });
    const { parser, workspace } = createServerContext({} as Connection, wrapper);
    const document = testDocumentFromUri(source, {
        uri: `file:///schema-completion.${language === "xquery" ? "xq" : "jq"}`,
        languageId: language,
    });
    return {
        items: await findCompletions(
            document,
            document.positionAt(source.length),
            parser,
            workspace,
            wrapper,
        ),
        sendRequest,
        document,
    };
}

describe("schema constructor completion", () => {
    it("offers local constructor names and aliases for the function default", async () => {
        const header =
            'declare default function namespace "urn:test"; import schema namespace s = "urn:test" at "types.xsd"; ';
        const { items } = await complete(header + "let $value := ", "xquery");
        // Both spellings call the constructor in the default function namespace.
        for (const label of ["Code", "s:Code"]) {
            expect(items.find((item) => item.label === label)).toMatchObject({
                kind: CompletionItemKind.Function,
                insertText: label + "(${1:\\$value})$0",
            });
        }
        const types = await complete(header + "declare variable $value as ", "xquery");
        // A function default must not change type completion.
        expect(types.items.some((item) => item.label === "Code")).toBe(false);
        expect(types.items.find((item) => item.label === "s:Code")).toMatchObject({
            labelDetails: { description: "XML Schema type" },
        });
    });

    it.each(["jsoniq", "xquery"])(
        "uses the typed namespace alias and replaces its prefix in %s",
        async (language) => {
            const { items, sendRequest, document } = await complete(
                'import schema namespace s = "urn:test" at "types.xsd"; declare namespace alias = "urn:test"; alias:',
                language,
            );
            // Canonical catalog names must be rendered with the query's alias, even in an unfinished body.
            expect(items).toHaveLength(1);
            expect(items[0]).toMatchObject({
                label: "alias:Code",
                kind: CompletionItemKind.Function,
                labelDetails: { detail: "(xs:anyAtomicType?) as Code?" },
                insertTextFormat: InsertTextFormat.Snippet,
            });
            expect(items[0]!.detail).toContain("alias:Code(xs:anyAtomicType?) as");
            expect(items[0]!.textEdit).toEqual({
                range: {
                    start: document.positionAt(document.getText().length - "alias:".length),
                    end: document.positionAt(document.getText().length),
                },
                newText: "alias:Code(${1:\\$value})$0",
            });
            // Namespace presentation uses the shared analysis; it must not issue another catalog request.
            expect(sendRequest).toHaveBeenCalledTimes(1);
        },
    );

    it("offers all bound aliases and excludes constructors from type-only completion", async () => {
        const prolog =
            'import schema namespace s = "urn:test" at "types.xsd"; declare namespace alias = "urn:test"; ';
        const { items } = await complete(prolog + "let $x := ", "jsoniq");
        expect(
            items.filter((item) => item.label.endsWith(":Code")).map((item) => item.label),
        ).toEqual(["alias:Code", "s:Code"]);
        // In a type context the same name represents a type, with no constructor call snippet.
        const types = await complete(prolog + "1 cast as s:", "jsoniq");
        expect(types.items.find((item) => item.label === "s:Code")).toMatchObject({
            kind: CompletionItemKind.Class,
            insertText: "s:Code",
        });
        expect(types.items.every((item) => item.kind !== CompletionItemKind.Function)).toBe(true);
    });

    it("uses an expanded QName when the schema namespace has no prefix", async () => {
        const { items } = await complete(
            'import schema "urn:test" at "types.xsd"; let $x := ',
            "xquery",
        );
        // Without a bound prefix, inserting bare Code would resolve to the wrong namespace.
        expect(items.find((item) => item.label === "Q{urn:test}Code")).toMatchObject({
            kind: CompletionItemKind.Function,
            insertText: "Q{urn:test\\}Code(${1:\\$value})$0",
        });
    });
});

describe("schema type completion", () => {
    it("offers unprefixed types for the element/type default without changing constructors", async () => {
        const header = 'import schema default element namespace "urn:test" at "types.xsd"; ';
        const types = await complete(header + "declare variable $value as ", "jsoniq");
        // A matching type default permits the local name instead of an expanded QName.
        expect(types.items.find((item) => item.label === "Code")).toMatchObject({
            kind: CompletionItemKind.Class,
            insertText: "Code",
        });
        expect(types.items.some((item) => item.label === "Q{urn:test}Code")).toBe(false);
        const functions = await complete(header + "let $value := ", "jsoniq");
        // Constructor calls follow the separate default function namespace.
        expect(functions.items.find((item) => item.label === "Q{urn:test}Code")).toMatchObject({
            kind: CompletionItemKind.Function,
        });
        expect(functions.items.some((item) => item.label === "Code")).toBe(false);
    });

    it("keeps types qualified when their namespace differs from the default", async () => {
        const { items } = await complete(
            'declare default element namespace "urn:other"; import schema "urn:test" at "types.xsd"; declare variable $value as ',
            "jsoniq",
        );
        // A bare Code would resolve to urn:other rather than the schema's urn:test.
        expect(items.find((item) => item.label === "Q{urn:test}Code")).toBeDefined();
        expect(items.some((item) => item.label === "Code")).toBe(false);
    });

    it("treats an explicitly empty default as no namespace", async () => {
        const { items } = await complete(
            'import schema default element namespace "" at "types.xsd"; declare variable $value as ',
            "xquery",
            {
                ...catalog,
                types: [{ name: { namespaceUri: "", localName: "Code" } }],
                constructors: [],
            },
        );
        // Empty is a meaningful default value, not a missing setting.
        expect(items.find((item) => item.label === "Code")).toMatchObject({ insertText: "Code" });
        expect(items.some((item) => item.label === "Q{}Code")).toBe(false);
    });

    it.each([
        ["jsoniq", "declare variable $value as alias:"],
        ["xquery", "declare variable $value as alias:"],
        ["jsoniq", "1 instance of alias:"],
        ["xquery", "1 instance of alias:"],
    ])("offers types and replaces the alias prefix for %s %s", async (language, body) => {
        const { items, document, sendRequest } = await complete(
            'import schema namespace s = "urn:test" at "types.xsd"; declare namespace alias = "urn:test"; ' +
                body,
            language,
        );
        // A complex type must be offered even though the catalog supplies no constructor for it.
        expect(items.map((item) => item.label)).toEqual(["alias:Code", "alias:Record"]);
        expect(
            items.every(
                (item) =>
                    item.kind === CompletionItemKind.Class &&
                    item.insertTextFormat !== InsertTextFormat.Snippet,
            ),
        ).toBe(true);
        expect(items.find((item) => item.label === "alias:Record")?.textEdit).toEqual({
            range: {
                start: document.positionAt(document.getText().length - "alias:".length),
                end: document.positionAt(document.getText().length),
            },
            newText: "alias:Record",
        });
        expect(sendRequest).toHaveBeenCalledTimes(1);
    });

    it("uses expanded QNames when no prefix is bound and filters unrelated namespaces", async () => {
        const unprefixed = await complete(
            'import schema "urn:test" at "types.xsd"; declare variable $value as ',
            "xquery",
        );
        // Expanded QNames are plain text here: braces do not need snippet escaping.
        expect(unprefixed.items.find((item) => item.label === "Q{urn:test}Record")).toMatchObject({
            kind: CompletionItemKind.Class,
            insertText: "Q{urn:test}Record",
        });
        const unrelated = await complete(
            'import schema namespace s = "urn:test" at "types.xsd"; declare namespace other = "urn:other"; 1 instance of other:',
            "jsoniq",
        );
        expect(unrelated.items).toEqual([]);
    });
});
