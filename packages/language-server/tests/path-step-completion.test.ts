import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

import { findCompletions } from "server/lsp/features/completion.js";
import { describe, expect, it } from "vitest";
import { CompletionItemKind, type CompletionItem } from "vscode-languageserver";

import { parserService, workspaceService, wrapperClient } from "./services.js";
import { testDocumentFromUri } from "./test-utils.js";

const SCHEMA = `<xs:schema xmlns:xs="http://www.w3.org/2001/XMLSchema" xmlns:o="urn:order"
           targetNamespace="urn:order" elementFormDefault="qualified">
    <xs:element name="order">
        <xs:complexType>
            <xs:sequence>
                <xs:element name="price" type="xs:decimal" maxOccurs="unbounded"/>
                <xs:element name="paid" type="xs:boolean" minOccurs="0"/>
            </xs:sequence>
            <xs:attribute name="id" type="xs:integer" use="required"/>
        </xs:complexType>
    </xs:element>
</xs:schema>`;

const QUERY_PREFIX = [
    'import schema namespace o = "urn:order" at "order.xsd";',
    'let $order := validate { <o:order id="1"><o:price>1</o:price></o:order> }',
];

describe("path step completion", () => {
    it("suggests the children that the schema declares after '/'", async () => {
        const items = await completeAtEnd("return $order/");

        expect(
            items.map((item) => [item.label, item.labelDetails?.description, item.kind]),
        ).toEqual(
            expect.arrayContaining([
                ["o:price", "element(o:price, xs:decimal)+", CompletionItemKind.Field],
                ["o:paid", "element(o:paid, xs:boolean)?", CompletionItemKind.Field],
            ]),
        );
    }, 45_000);

    it("suggests the attributes that the schema declares after '/@'", async () => {
        const items = await completeAtEnd("return $order/@");

        const id = items.find((item) => item.label === "@id");
        expect(id?.labelDetails?.description).toBe("attribute(id, xs:integer)");
        expect(id?.kind).toBe(CompletionItemKind.Property);
        // The typed `@` is replaced, so that the editor matches it against the label.
        expect(id?.filterText).toBeUndefined();
        const line = QUERY_PREFIX.length;
        expect(id?.textEdit).toEqual({
            range: {
                start: { line, character: "return $order/".length },
                end: { line, character: "return $order/@".length },
            },
            newText: "@id",
        });
    }, 45_000);

    it("ranks children, then attributes, before functions such as data()", async () => {
        const items = await completeAtEnd("return $order/");

        expect(items.slice(0, 3).map((item) => item.label)).toEqual(["o:paid", "o:price", "@id"]);
        expect(items.find((item) => item.label === "@id")?.filterText).toBe("id");
        expect(items.map((item) => item.label)).toContain("fn:data");
    }, 45_000);

    it("suggests the elements below each descendant after '//'", async () => {
        const items = await completeAtEnd("return $order//");

        expect(items.map((item) => [item.label, item.labelDetails?.description])).toEqual(
            expect.arrayContaining([
                ["o:price", "element(o:price, xs:decimal)*"],
                ["o:paid", "element(o:paid, xs:boolean)*"],
            ]),
        );
    }, 45_000);

    it("suggests the steps of a path that ends another expression", async () => {
        const items = await completeAtEnd("return $order/o:paid and $order/");

        expect(items.map((item) => item.label)).toEqual(
            expect.arrayContaining(["o:price", "o:paid"]),
        );
    }, 45_000);

    it("suggests the children of the context item in a predicate", async () => {
        // Editors close the bracket when it is typed.
        const items = await completeAtEnd("return $order[o:pr", "]");

        expect(items.map((item) => [item.label, item.labelDetails?.description])).toContainEqual([
            "o:price",
            "element(o:price, xs:decimal)+",
        ]);
    }, 45_000);

    it("suggests the children of the context item on the right of '!'", async () => {
        const items = await completeAtEnd("return $order ! o:");

        expect(items.map((item) => item.label)).toEqual(
            expect.arrayContaining(["o:price", "o:paid"]),
        );
    }, 45_000);

    it("suggests nothing after '@' outside a schema-typed path", async () => {
        const document = testDocumentFromUri("let $x := <a/> return $x/@", {
            uri: "file:///path-step-attribute.xq",
            languageId: "xquery",
        });

        await expect(
            findCompletions(
                document,
                document.positionAt(document.getText().length),
                parserService,
                workspaceService,
                wrapperClient,
            ),
        ).resolves.toEqual([]);
    }, 45_000);

    it("replaces the part of a step name typed so far", async () => {
        const items = await completeAtEnd("return $order/o:pr");

        expect(items[0]?.label).toBe("o:price");
        const line = QUERY_PREFIX.length;
        expect(items[0]?.textEdit).toEqual({
            range: {
                start: { line, character: "return $order/".length },
                end: { line, character: "return $order/o:pr".length },
            },
            newText: "o:price",
        });
    }, 45_000);
});

/** Completes at the end of lastLine, before any text that follows the cursor. */
async function completeAtEnd(lastLine: string, afterCursor = ""): Promise<CompletionItem[]> {
    const directory = mkdtempSync(join(tmpdir(), "path-step-completion-"));
    writeFileSync(join(directory, "order.xsd"), SCHEMA);
    const document = testDocumentFromUri([...QUERY_PREFIX, lastLine + afterCursor], {
        uri: pathToFileURL(join(directory, "query.xq")).toString(),
        languageId: "xquery",
    });
    return findCompletions(
        document,
        document.positionAt(document.getText().length - afterCursor.length),
        parserService,
        workspaceService,
        wrapperClient,
    );
}
