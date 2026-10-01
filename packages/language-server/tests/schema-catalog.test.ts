import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";

import { findSymbolAtPosition, getVisibleDeclarationsAtPosition } from "server/analysis/index.js";
import { createServerContext } from "server/app/context.js";
import { RumbleWrapperClient } from "server/integrations/rumble/client.js";
import type { SchemaCatalogWireResult } from "server/integrations/rumble/operations/schema-catalog/protocol.js";
import { getSchemaCatalog } from "server/integrations/rumble/operations/schema-catalog/service.js";
import { describe, expect, it, vi } from "vitest";
import { TextDocument } from "vscode-languageserver-textdocument";
import type { Connection } from "vscode-languageserver/node";

import { createMockWrapperClient, positionAt, testDocument } from "./test-utils.js";

describe("schema catalog", () => {
    it("sends schema imports and base URI and returns schema-loading errors", async () => {
        const body: SchemaCatalogWireResult = {
            types: [],
            constructors: [],
            errors: [
                {
                    code: "XQST0059",
                    message: "Schema could not be loaded",
                    location: "file:///query.xq",
                    range: { start: { line: 0, character: 0 }, end: { line: 0, character: 1 } },
                },
            ],
        };
        const sendRequest = vi.fn().mockResolvedValue({
            id: 1,
            responseType: "schema-catalog",
            body,
            error: null,
        });
        const document = testDocument(
            "schema-catalog",
            'import schema namespace t = "urn:café"; 1',
        );

        const input = {
            imports: [{ namespaceUri: "urn:café", locations: ["types.xsd"] }],
            baseUri: "schemas/",
        };
        const result = await getSchemaCatalog(
            document.uri,
            input,
            createMockWrapperClient({ sendRequest }),
        );

        expect(sendRequest).toHaveBeenCalledExactlyOnceWith({
            requestType: "schema-catalog",
            body: Buffer.from(JSON.stringify(input), "utf8").toString("base64"),
            documentUri: document.uri,
        });
        expect(result).toEqual(body);
    });

    it("does not send a request when the wrapper is unavailable", async () => {
        const sendRequest = vi.fn();
        const client = createMockWrapperClient({ isUsable: () => false, sendRequest });

        expect(
            await getSchemaCatalog("file:///schema-catalog.jq", { imports: [] }, client),
        ).toEqual({
            types: [],
            constructors: [],
            errors: [],
        });
        expect(sendRequest).not.toHaveBeenCalled();
    });

    it.each([
        ["a rejected request", () => Promise.reject(new Error("unavailable"))],
        [
            "a wrapper error",
            () =>
                Promise.resolve({
                    id: 1,
                    responseType: "schema-catalog",
                    body: null,
                    error: { code: "UNSUPPORTED_REQUEST_TYPE", message: "Unsupported request" },
                }),
        ],
    ])("returns an empty result for %s", async (_name, response) => {
        const client = createMockWrapperClient({
            sendRequest: vi.fn().mockImplementation(response),
        });

        expect(
            await getSchemaCatalog("file:///schema-catalog.jq", { imports: [] }, client),
        ).toEqual({
            types: [],
            constructors: [],
            errors: [],
        });
    });

    it.each(["jsoniq", "xquery"])(
        "loads schemas through the real wrapper with an incomplete %s body",
        async (language) => {
            const directory = await mkdtemp(path.join(tmpdir(), "lsp-schema-catalog-"));
            const client = new RumbleWrapperClient();
            try {
                await mkdir(path.join(directory, "schemas"));
                await writeFile(
                    path.join(directory, "schemas", "types.xsd"),
                    `
                <xs:schema xmlns:xs="http://www.w3.org/2001/XMLSchema" targetNamespace="urn:test">
                  <xs:simpleType name="Code"><xs:restriction base="xs:string"/></xs:simpleType>
                </xs:schema>`,
                );
                const document = TextDocument.create(
                    pathToFileURL(
                        path.join(directory, language === "xquery" ? "query.xq" : "query.jq"),
                    ).href,
                    language,
                    1,
                    'declare base-uri "schemas/"; import schema namespace t = "urn:test" at "types.xsd"; t:Code("a")',
                );

                const result = await getSchemaCatalog(
                    document.uri,
                    {
                        imports: [{ namespaceUri: "urn:test", locations: ["types.xsd"] }],
                        baseUri: "schemas/",
                    },
                    client,
                );

                expect(result.errors).toEqual([]);
                expect(result.types).toEqual([{ localName: "Code", namespaceUri: "urn:test" }]);
                expect(result.constructors).toEqual([
                    {
                        name: { qname: { localName: "Code", namespaceUri: "urn:test" }, arity: 1 },
                        signature: {
                            parameterTypes: [
                                {
                                    type: {
                                        itemType: {
                                            kind: "named",
                                            name: {
                                                localName: "anyAtomicType",
                                                namespaceUri: "http://www.w3.org/2001/XMLSchema",
                                                prefix: "xs",
                                            },
                                        },
                                        arity: "?",
                                    },
                                },
                            ],
                            returnType: {
                                itemType: {
                                    kind: "named",
                                    name: { localName: "Code", namespaceUri: "urn:test" },
                                },
                                arity: "?",
                            },
                        },
                    },
                ]);
                // Exercise the production wiring with an actual XSD and Java response, beyond mocked catalogs.
                const { workspace } = createServerContext({} as Connection, client);
                const analysis = await workspace.getAnalysis(document);
                expect(analysis.diagnostics).toEqual([]);
                expect(
                    findSymbolAtPosition(analysis, positionAt(document, 't:Code("a")'))
                        ?.declaration,
                ).toEqual({
                    ...result.constructors[0],
                    kind: "function",
                    origin: "implicit",
                });
                // An unfinished body must not prevent the workspace from loading the same schema.
                TextDocument.update(
                    document,
                    [
                        {
                            text: 'declare base-uri "schemas/"; import schema namespace t = "urn:test" at "types.xsd"; t:',
                        },
                    ],
                    2,
                );
                const incomplete = await workspace.getAnalysis(document);
                expect(
                    getVisibleDeclarationsAtPosition(incomplete, document.getText().length),
                ).toContainEqual({
                    ...result.constructors[0],
                    kind: "function",
                    origin: "implicit",
                });
            } finally {
                client.dispose();
                await rm(directory, { recursive: true, force: true });
            }
        },
        30_000,
    );
});
