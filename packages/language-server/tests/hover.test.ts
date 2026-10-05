import {
    ERR_NAMESPACE,
    findNodeThatContainsPosition,
    type SequenceType,
} from "server/analysis/index.js";
import { findHover } from "server/lsp/features/hover.js";
import { describe, expect, it, vi } from "vitest";
import type { Range } from "vscode-languageserver";
import type { TextDocument } from "vscode-languageserver-textdocument";

import { workspaceService, wrapperClient } from "./services.js";
import {
    createMockWrapperClient,
    positionAt,
    testDocument,
    testDocumentFromUri,
} from "./test-utils.js";

function rangeOf(document: TextDocument, source: string): Range {
    const start = document.getText().indexOf(source);
    expect(start).toBeGreaterThanOrEqual(0);
    return { start: document.positionAt(start), end: document.positionAt(start + source.length) };
}

function inferredType(localName: string): SequenceType {
    return {
        itemType: {
            kind: "named",
            name: { namespaceUri: "http://www.w3.org/2001/XMLSchema", prefix: "xs", localName },
        },
        arity: "",
    };
}

function typeWrapper(range?: Range, sequenceType?: SequenceType) {
    return createMockWrapperClient({
        sendRequest: vi.fn().mockResolvedValue({
            id: 1,
            responseType: "type-at-position",
            body: { range, sequenceType },
            error: null,
        }),
    });
}

describe("semantic hover ranges", () => {
    let documentId = 0;
    function document(source: string, languageId = "jsoniq") {
        return testDocumentFromUri(source, {
            uri: `file:///hover-ranges-${++documentId}.${languageId === "xquery" ? "xq" : "jq"}`,
            languageId,
        });
    }

    it.each([
        ["jsoniq", "2.03 instance of xs:decimal?"],
        ["jsoniq", "2.03 cast as xs:decimal"],
        ["xquery", "2.03 instance of xs:decimal?"],
        ["xquery", "2.03 cast as xs:decimal"],
    ])("suppresses type-name hovers in %s: %s", async (languageId, source) => {
        const doc = document(source, languageId);
        const wrapper = typeWrapper(rangeOf(doc, source), inferredType("boolean"));
        const hover = await findHover(
            doc,
            positionAt(doc, "xs:decimal"),
            workspaceService,
            wrapper,
        );
        expect(hover).toBeNull();
        expect(wrapper.sendRequest).not.toHaveBeenCalled();
    });

    it.each([
        ["2.03 instance of xs:decimal", "instance", "boolean"],
        ["declare function local:f($v) { $v }; local:f(1)", "local:f(1)", "integer"],
    ])("pairs expression text and type for %s", async (source, target, name) => {
        const doc = document(source);
        const expression = target === "instance" ? source : target;
        const range = rangeOf(doc, expression);
        // For the function call, target the reference rather than its declaration.
        const position = doc.positionAt(doc.getText().lastIndexOf(target));
        const hover = await findHover(
            doc,
            position,
            workspaceService,
            typeWrapper(range, inferredType(name)),
        );
        expect(hover).toEqual({
            range,
            contents: {
                kind: "markdown",
                value: `\`\`\`jsoniq\n${expression} as xs:${name}\n\`\`\``,
            },
        });
    });

    it("keeps variable hovers on the variable when inference selects it", async () => {
        const doc = document("let $v := 1 return $v");
        const position = doc.positionAt(doc.getText().lastIndexOf("$v"));
        const range = { start: position, end: doc.positionAt(doc.offsetAt(position) + 2) };
        expect(
            await findHover(
                doc,
                position,
                workspaceService,
                typeWrapper(range, inferredType("integer")),
            ),
        ).toEqual({
            range,
            contents: { kind: "markdown", value: "```jsoniq\n$v as xs:integer\n```" },
        });
    });

    it("keeps namespace names separate from expression inference", async () => {
        const doc = document('declare namespace example = "urn:example"; 1');
        const wrapper = typeWrapper(rangeOf(doc, "1"), inferredType("integer"));
        expect(
            await findHover(doc, positionAt(doc, "example"), workspaceService, wrapper),
        ).toBeNull();
        expect(wrapper.sendRequest).not.toHaveBeenCalled();
    });

    it.each([
        [undefined, undefined],
        [undefined, inferredType("integer")],
        [{ start: { line: 0, character: 19 }, end: { line: 0, character: 21 } }, undefined],
    ])(
        "suppresses hovers without a complete type-and-range result",
        async (range, sequenceType) => {
            const doc = document("let $v := 1 return $v");
            const position = doc.positionAt(doc.getText().lastIndexOf("$v"));
            expect(
                await findHover(doc, position, workspaceService, typeWrapper(range, sequenceType)),
            ).toBeNull();
        },
    );
});

describe("error code hover", () => {
    it("shows W3C documentation for a JSONiq catch error target", async () => {
        const document = testDocument(
            "hover-error-code",
            "try { 1 div 0 } catch err:FOAR0001 { 0 }",
        );

        const hover = await findHover(
            document,
            positionAt(document, "FOAR0001"),
            workspaceService,
            wrapperClient,
        );

        expect(hover).toEqual({
            range: {
                start: positionAt(document, "err:FOAR0001"),
                end: document.positionAt(
                    document.getText().indexOf("err:FOAR0001") + "err:FOAR0001".length,
                ),
            },
            contents: {
                kind: "markdown",
                value: expect.stringContaining("Division by zero."),
            },
        });
    });

    it("resolves an alias for the standard error namespace", async () => {
        const document = testDocument("hover-error-code-alias", [
            `declare namespace errors = "${ERR_NAMESPACE}";`,
            "try { 1 div 0 } catch errors:FOAR0001 { 0 }",
        ]);

        const hover = await findHover(
            document,
            positionAt(document, "FOAR0001"),
            workspaceService,
            wrapperClient,
        );

        expect(hover?.contents).toMatchObject({
            value: expect.stringContaining("err:FOAR0001"),
        });
        expect(hover?.range).toEqual({
            start: positionAt(document, "errors:FOAR0001"),
            end: document.positionAt(
                document.getText().indexOf("errors:FOAR0001") + "errors:FOAR0001".length,
            ),
        });
    });

    it("shows W3C documentation for an XQuery catch error target", async () => {
        const document = testDocumentFromUri("try { 1 div 0 } catch err:FOAR0001 { 0 }", {
            uri: "file:///hover-error-code.xq",
            languageId: "xquery",
        });

        const hover = await findHover(
            document,
            positionAt(document, "FOAR0001"),
            workspaceService,
            wrapperClient,
        );

        expect(hover?.contents).toMatchObject({
            value: expect.stringContaining("Division by zero."),
        });
    });

    it("keeps wildcard catch targets as syntax-aware AST nodes", async () => {
        const document = testDocument(
            "hover-error-code-wildcard",
            "try { 1 div 0 } catch err:* { 0 }",
        );
        const analysis = await workspaceService.getAnalysis(document);

        const node = findNodeThatContainsPosition(analysis, positionAt(document, "err:*"));

        expect(node).toMatchObject({
            kind: "error-code-target",
            target: { kind: "wildcard", value: "err:*" },
        });
    });
});
