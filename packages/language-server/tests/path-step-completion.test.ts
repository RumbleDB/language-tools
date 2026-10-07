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
        expect(items).toHaveLength(2);
    }, 45_000);

    it("suggests the attributes that the schema declares after '/@'", async () => {
        const items = await completeAtEnd("return $order/@");

        expect(items.map((item) => [item.label, item.labelDetails?.description])).toEqual([
            ["id", "attribute(id, xs:integer)"],
        ]);
    }, 45_000);

    it("suggests the elements below each descendant after '//'", async () => {
        const items = await completeAtEnd("return $order//");

        expect(items.map((item) => [item.label, item.labelDetails?.description])).toEqual(
            expect.arrayContaining([
                ["o:price", "element(o:price, xs:decimal)*"],
                ["o:paid", "element(o:paid, xs:boolean)*"],
            ]),
        );
        expect(items).toHaveLength(2);
    }, 45_000);

    it("suggests the attributes of the path and its descendants after '//@'", async () => {
        const items = await completeAtEnd("return $order//@");

        expect(items.map((item) => [item.label, item.labelDetails?.description])).toEqual([
            ["id", "attribute(id, xs:integer)*"],
        ]);
    }, 45_000);

    it("replaces the part of a step name typed so far", async () => {
        const items = await completeAtEnd("return $order/o:pr");

        expect(items.map((item) => item.label)).toEqual(["o:price"]);
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

async function completeAtEnd(lastLine: string): Promise<CompletionItem[]> {
    const directory = mkdtempSync(join(tmpdir(), "path-step-completion-"));
    writeFileSync(join(directory, "order.xsd"), SCHEMA);
    const document = testDocumentFromUri([...QUERY_PREFIX, lastLine], {
        uri: pathToFileURL(join(directory, "query.xq")).toString(),
        languageId: "xquery",
    });
    return findCompletions(
        document,
        document.positionAt(document.getText().length),
        parserService,
        workspaceService,
        wrapperClient,
    );
}
