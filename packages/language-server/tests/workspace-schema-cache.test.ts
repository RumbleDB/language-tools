import {
    findSymbolAtPosition,
    getDefinitions,
    getVisibleDeclarationsAtPosition,
} from "server/analysis/index.js";
import { createServerContext } from "server/app/context.js";
import type { SchemaCatalogWireResult } from "server/integrations/rumble/operations/schema-catalog/protocol.js";
import { describe, expect, it, vi } from "vitest";
import { TextDocument } from "vscode-languageserver-textdocument";
import { FileChangeType, type Connection } from "vscode-languageserver/node";

import { createMockWrapperClient, positionAt, testDocument } from "./test-utils.js";

const schemaImport = 'import schema namespace s = "urn:test" at "types.xsd";';
const source = `${schemaImport} s:Code("a")`;
const catalog: SchemaCatalogWireResult = {
    types: [{ namespaceUri: "urn:test", localName: "Code" }],
    constructors: [
        {
            name: { qname: { namespaceUri: "urn:test", localName: "Code" }, arity: 1 },
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
                    itemType: {
                        kind: "named",
                        name: { namespaceUri: "urn:test", localName: "Code" },
                    },
                    arity: "?",
                },
            },
        },
    ],
    errors: [],
};

function response(body = catalog) {
    return { id: 1, responseType: "schema-catalog", body, error: null };
}

function setup() {
    const sendRequest = vi.fn().mockResolvedValue(response());
    const wrapper = createMockWrapperClient({ sendRequest });
    const context = createServerContext({} as Connection, wrapper);
    return { ...context, sendRequest };
}

function update(document: TextDocument, text: string) {
    TextDocument.update(document, [{ text }], document.version + 1);
}

describe("workspace schema catalog cache", () => {
    it("tracks nested schema files across body edits and removes obsolete dependencies after reload", async () => {
        const { workspace, sendRequest } = setup();
        // Rumble uses file:/; VSCode sends file:///. Both must identify the same dependency.
        sendRequest.mockResolvedValueOnce(
            response({ ...catalog, dependencies: ["file:/nested.xsd"] }),
        );
        const document = testDocument("schema-cache-nested", source);
        await workspace.getAnalysis(document);
        update(document, source + " (: body edit :) ");
        await workspace.getAnalysis(document);
        expect(sendRequest).toHaveBeenCalledTimes(1);
        const affected = await workspace.updateWatchedFiles([
            { uri: "file:///nested.xsd", type: FileChangeType.Changed },
        ]);
        expect(affected.has(document.uri)).toBe(true);
        const current = await workspace.getAnalysis(document);
        // The replacement catalog no longer loads nested.xsd, so its old edge must disappear.
        await workspace.updateWatchedFiles([
            { uri: "file:///nested.xsd", type: FileChangeType.Deleted },
        ]);
        expect(await workspace.getAnalysis(document)).toBe(current);
        expect(sendRequest).toHaveBeenCalledTimes(2);
    });

    it("retries a failed catalog when a missing nested schema is created", async () => {
        const { workspace, sendRequest } = setup();
        sendRequest.mockResolvedValueOnce(
            response({
                types: [],
                constructors: [],
                dependencies: ["file:/missing.xsd"],
                errors: [
                    {
                        code: "XQST0059",
                        message: "Missing included schema",
                        location: "file:///missing.xsd",
                        range: { start: { line: 0, character: 0 }, end: { line: 0, character: 0 } },
                    },
                ],
            }),
        );
        const document = testDocument("schema-cache-missing-include", source);
        const failed = await workspace.getAnalysis(document);
        expect(failed.diagnostics.map((diagnostic) => diagnostic.code)).toContain(
            "unresolved-function",
        );
        // Error responses still carry dependencies, so creation can recover without a query edit.
        const affected = await workspace.updateWatchedFiles([
            { uri: "file:///missing.xsd", type: FileChangeType.Created },
        ]);
        expect(affected.has(document.uri)).toBe(true);
        expect((await workspace.getAnalysis(document)).diagnostics).toEqual([]);
        expect(sendRequest).toHaveBeenCalledTimes(2);
    });

    it("keeps known nested dependencies while a reload is pending and ignores obsolete responses", async () => {
        const { workspace, sendRequest } = setup();
        sendRequest.mockResolvedValueOnce(
            response({ ...catalog, dependencies: ["file:/nested.xsd"] }),
        );
        const document = testDocument("schema-cache-nested-pending", source);
        await workspace.getAnalysis(document);
        await workspace.updateWatchedFiles([
            { uri: "file:///types.xsd", type: FileChangeType.Changed },
        ]);
        const pending = Promise.withResolvers<ReturnType<typeof response>>();
        sendRequest.mockReturnValueOnce(pending.promise);
        const old = workspace.getAnalysis(document);
        // The known nested file remains a dependency even before the replacement catalog arrives.
        const affected = await workspace.updateWatchedFiles([
            { uri: "file:///nested.xsd", type: FileChangeType.Changed },
        ]);
        expect(affected.has(document.uri)).toBe(true);
        const current = await workspace.getAnalysis(document);
        pending.resolve(response({ ...catalog, dependencies: ["file:/obsolete.xsd"] }));
        await old;
        // Finishing the old request must not publish its obsolete dependency edges.
        const obsolete = await workspace.updateWatchedFiles([
            { uri: "file:///obsolete.xsd", type: FileChangeType.Changed },
        ]);
        expect(obsolete.has(document.uri)).toBe(false);
        expect(await workspace.getAnalysis(document)).toBe(current);
        expect(sendRequest).toHaveBeenCalledTimes(3);
    });

    it.each([
        FileChangeType.Created,
        FileChangeType.Changed,
        FileChangeType.Deleted,
    ] as Array<FileChangeType>)(
        "reloads a directly imported schema after file event %s without editing the query",
        async (type) => {
            const { workspace, sendRequest } = setup();
            const document = testDocument("schema-cache-file-event", source);
            const first = await workspace.getAnalysis(document);
            // Unrelated schemas must not invalidate this query's catalog.
            await workspace.updateWatchedFiles([{ uri: "file:///unrelated.xsd", type }]);
            expect(await workspace.getAnalysis(document)).toBe(first);
            const affected = await workspace.updateWatchedFiles([
                { uri: "file:///types.xsd", type },
            ]);
            expect(affected.has(document.uri)).toBe(true);
            expect(await workspace.getAnalysis(document)).not.toBe(first);
            expect(sendRequest).toHaveBeenCalledTimes(2);
        },
    );

    it("resolves schema dependencies against the declared base URI and removes old dependencies", async () => {
        const { workspace, sendRequest } = setup();
        const document = testDocument(
            "schema-cache-dependencies",
            `declare base-uri "schemas/"; ${source}`,
        );
        await workspace.getAnalysis(document);
        update(document, `declare base-uri "schemas/"; ${source.replace("types.xsd", "new.xsd")}`);
        const current = await workspace.getAnalysis(document);
        // Changing the import removes its old graph edge, so saving the old XSD has no effect.
        await workspace.updateWatchedFiles([
            { uri: "file:///schemas/types.xsd", type: FileChangeType.Changed },
        ]);
        expect(await workspace.getAnalysis(document)).toBe(current);
        const affected = await workspace.updateWatchedFiles([
            { uri: "file:///schemas/new.xsd", type: FileChangeType.Changed },
        ]);
        expect(affected.has(document.uri)).toBe(true);
        await workspace.getAnalysis(document);
        expect(sendRequest).toHaveBeenCalledTimes(3);
    });

    it("invalidates a pending schema request when its file changes", async () => {
        const { workspace, sendRequest } = setup();
        const pending = Promise.withResolvers<ReturnType<typeof response>>();
        sendRequest.mockReturnValueOnce(pending.promise);
        const document = testDocument("schema-cache-pending-file", source);
        const first = workspace.getAnalysis(document);
        await workspace.updateWatchedFiles([
            { uri: "file:///types.xsd", type: FileChangeType.Changed },
        ]);
        const current = await workspace.getAnalysis(document);
        // Complete the obsolete catalog last: it must not restore stale constructors or analysis.
        pending.resolve(response({ types: [], constructors: [], errors: [] }));
        await first;
        expect(await workspace.getAnalysis(document)).toBe(current);
        expect(current.diagnostics).toEqual([]);
        expect(sendRequest).toHaveBeenCalledTimes(2);
    });

    it("reuses the catalog for body edits and prefix aliases, including an incomplete body", async () => {
        const { workspace, sendRequest } = setup();
        const document = testDocument("schema-cache-body", source);
        await workspace.getAnalysis(document);
        update(document, `${schemaImport} s:Code("b")`);
        const edited = await workspace.getAnalysis(document);
        expect(
            findSymbolAtPosition(edited, positionAt(document, 's:Code("b")'))?.declaration?.origin,
        ).toBe("schema");

        // Prefixes affect presentation and name resolution, but not the schema catalog.
        update(document, 'import schema namespace alias = "urn:test" at "types.xsd"; alias:');
        const incomplete = await workspace.getAnalysis(document);
        expect(
            getVisibleDeclarationsAtPosition(incomplete, document.getText().length),
        ).toContainEqual({
            ...catalog.constructors[0],
            kind: "function",
            origin: "schema",
        });
        expect(sendRequest).toHaveBeenCalledTimes(1);
    });

    it("shares a pending catalog between different document versions", async () => {
        const { workspace, sendRequest } = setup();
        const pending = Promise.withResolvers<ReturnType<typeof response>>();
        const started = Promise.withResolvers<void>();
        sendRequest.mockImplementationOnce(() => {
            started.resolve();
            return pending.promise;
        });
        const document = testDocument("schema-cache-pending", source);
        const first = workspace.getAnalysis(document);
        await started.promise;
        // The analysis version changes while the catalog request is still running.
        update(document, `${schemaImport} s:Code("b")`);
        const second = workspace.getAnalysis(document);
        pending.resolve(response());
        const [old, current] = await Promise.all([first, second]);
        expect(current).not.toBe(old);
        expect(current.diagnostics).toEqual([]);
        expect(await workspace.getAnalysis(document)).toBe(current);
        expect(sendRequest).toHaveBeenCalledTimes(1);
    });

    it.each([
        ["namespace", 'import schema namespace s = "urn:other" at "types.xsd"; 1'],
        ["location", 'import schema namespace s = "urn:test" at "other.xsd"; 1'],
        ["base URI", `declare base-uri "schemas/"; ${schemaImport} 1`],
    ])("reloads when the %s changes", async (_field, changedSource) => {
        const { workspace, sendRequest } = setup();
        const document = testDocument("schema-cache-key", source);
        await workspace.getAnalysis(document);
        update(document, changedSource);
        await workspace.getAnalysis(document);
        expect(sendRequest).toHaveBeenCalledTimes(2);
        expect(sendRequest.mock.calls[1]![0].body).not.toBe(sendRequest.mock.calls[0]![0].body);
    });

    it("preserves import order in the key and scopes catalogs to their document URI", async () => {
        const { workspace, sendRequest } = setup();
        const other = 'import schema namespace o = "urn:other" at "other.xsd";';
        const document = testDocument("schema-cache-order", `${schemaImport} ${other} 1`);
        await workspace.getAnalysis(document);
        update(document, `${other} ${schemaImport} 1`);
        await workspace.getAnalysis(document);
        await workspace.getAnalysis(
            testDocument("schema-cache-other-document", document.getText()),
        );
        expect(sendRequest).toHaveBeenCalledTimes(3);
    });

    it.each(["empty catalog", "failed request"])(
        "does not let an older %s overwrite the current catalog or symbol index",
        async (oldResult) => {
            const { workspace, sendRequest } = setup();
            const pending = Promise.withResolvers<ReturnType<typeof response>>();
            const started = Promise.withResolvers<void>();
            sendRequest.mockImplementationOnce(() => {
                started.resolve();
                return pending.promise;
            });
            const document = testDocument("schema-cache-stale", source);
            const first = workspace.getAnalysis(document);
            await started.promise;
            update(
                document,
                'import schema namespace s = "urn:test" at "new.xsd"; declare variable $value := s:Code("a"); $value',
            );
            const current = await workspace.getAnalysis(document);
            // Finish the old request last with a different catalog, making accidental replacement observable.
            if (oldResult === "failed request") pending.reject(new Error("old request failed"));
            else pending.resolve(response({ types: [], constructors: [], errors: [] }));
            await first;
            expect(current.diagnostics).toEqual([]);
            const variable = [...getDefinitions(current.ast)].find(
                (definition) => definition.kind === "variable",
            )!;
            expect(await workspace.getReferencesToDefinition(variable)).toHaveLength(1);
            update(document, document.getText() + " (: body edit :)");
            expect((await workspace.getAnalysis(document)).diagnostics).toEqual([]);
            expect(sendRequest).toHaveBeenCalledTimes(2);
        },
    );

    it.each(["unavailable", "transport failure", "wrapper error"])(
        "retries after %s without a document edit",
        async (failure) => {
            const { workspace, wrapper, sendRequest } = setup();
            if (failure === "unavailable") vi.spyOn(wrapper, "isUsable").mockReturnValueOnce(false);
            if (failure === "transport failure")
                sendRequest.mockRejectedValueOnce(new Error("unavailable"));
            if (failure === "wrapper error")
                sendRequest.mockResolvedValueOnce({
                    id: 1,
                    responseType: "schema-catalog",
                    body: null,
                    error: { code: "UNSUPPORTED_REQUEST_TYPE", message: "unsupported" },
                });
            const document = testDocument("schema-cache-retry", source);
            const first = await workspace.getAnalysis(document);
            expect(first.diagnostics.map((diagnostic) => diagnostic.code)).toContain(
                "unresolved-function",
            );
            const recovered = await workspace.getAnalysis(document);
            expect(recovered.diagnostics).toEqual([]);
            await workspace.getAnalysis(document);
            expect(sendRequest).toHaveBeenCalledTimes(failure === "unavailable" ? 1 : 2);
        },
    );

    it("caches a valid empty catalog", async () => {
        const { workspace, sendRequest } = setup();
        sendRequest.mockResolvedValue(response({ types: [], constructors: [], errors: [] }));
        const document = testDocument("schema-cache-empty", `${schemaImport} 1`);
        await workspace.getAnalysis(document);
        update(document, `${schemaImport} 2`);
        await workspace.getAnalysis(document);
        expect(sendRequest).toHaveBeenCalledTimes(1);
    });

    it("clears the catalog when its schema imports are removed", async () => {
        const { workspace, sendRequest } = setup();
        const document = testDocument("schema-cache-remove", source);
        await workspace.getAnalysis(document);
        update(document, 'declare namespace s = "urn:test"; s:Code("a")');
        expect(
            (await workspace.getAnalysis(document)).diagnostics.map(
                (diagnostic) => diagnostic.code,
            ),
        ).toContain("unresolved-function");
        update(document, source);
        expect((await workspace.getAnalysis(document)).diagnostics).toEqual([]);
        expect(sendRequest).toHaveBeenCalledTimes(2);
    });

    it("discards a pending catalog when closing and reopening the same document version", async () => {
        const { workspace, parser, sendRequest } = setup();
        const pending = Promise.withResolvers<ReturnType<typeof response>>();
        const document = testDocument("schema-cache-reopen", source);
        sendRequest.mockReturnValueOnce(pending.promise);
        const first = workspace.getAnalysis(document);
        // Close before the deferred loader starts: a version check alone cannot identify this session.
        workspace.removeOpenDocument(document.uri);
        parser.clear(document.uri);
        const current = await workspace.getAnalysis(document);
        pending.resolve(response({ types: [], constructors: [], errors: [] }));
        await first;
        expect(await workspace.getAnalysis(document)).toBe(current);
        update(document, source + " (: body edit :)");
        expect((await workspace.getAnalysis(document)).diagnostics).toEqual([]);
        expect(sendRequest).toHaveBeenCalledTimes(2);
    });
});
