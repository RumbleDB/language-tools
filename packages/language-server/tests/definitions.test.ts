import { findSymbolAtPosition } from "server/analysis/index.js";
import { createServerContext } from "server/app/context.js";
import { findDefinitionLocation } from "server/lsp/features/definition.js";
import { describe, expect, it, vi } from "vitest";
import type { Connection } from "vscode-languageserver/node";

import { workspaceService } from "./services.js";
import {
    createMockWrapperClient,
    positionAt,
    positionAtNth,
    testDocument,
    testDocumentFromUri,
} from "./test-utils.js";

describe("JSONiq go-to-definition", () => {
    it("resolves variable reference to the nearest declaration", async () => {
        const document = testDocument("definitions-shadowing", [
            "declare variable $x := 10;",
            "declare function local:f($x) {",
            "  let $y := $x + 1",
            "  return $y + $x",
            "};",
            "local:f($x)",
        ]);

        const localReference = await findDefinitionLocation(
            document,
            { line: 3, character: 15 },
            workspaceService,
        );
        const globalReference = await findDefinitionLocation(
            document,
            { line: 5, character: 9 },
            workspaceService,
        );

        expect(localReference?.range.start.line).toBe(1);
        expect(globalReference?.range.start.line).toBe(0);
    });

    it("returns declaration location when cursor is already on declaration", async () => {
        const firstLine = "declare function local:f($x) {";
        const document = testDocument("definitions-on-declaration", [
            firstLine,
            "  return $x",
            "};",
        ]);

        const declarationCharacter = firstLine.indexOf("$x") + 1;
        const location = await findDefinitionLocation(
            document,
            {
                line: 0,
                character: declarationCharacter,
            },
            workspaceService,
        );

        expect(location).toBeDefined();
        expect(location?.range.start.line).toBe(0);
    });

    it("resolves definition when cursor is on the dollar sign of a parameter", async () => {
        const firstLine = "declare function local:f($x) {";
        const document = testDocument("definitions-parameter-dollar", [
            firstLine,
            "  return $x",
            "};",
        ]);

        const location = await findDefinitionLocation(
            document,
            {
                line: 0,
                character: firstLine.indexOf("$x"),
            },
            workspaceService,
        );

        expect(location).toBeDefined();
        expect(location?.range.start.line).toBe(0);
    });

    it("resolves function call to function declaration", async () => {
        const document = testDocument("definitions-function-call", [
            "declare function local:f($x) {",
            "  $x",
            "};",
            "local:f(1)",
        ]);

        const location = await findDefinitionLocation(
            document,
            { line: 3, character: 2 },
            workspaceService,
        );

        expect(location).toBeDefined();
        expect(location?.range.start).toEqual({ line: 0, character: "declare function ".length });
        expect(location?.range.end).toEqual({
            line: 0,
            character: "declare function local:f".length,
        });
    });

    it("returns null when position is not on a resolvable variable", async () => {
        const document = testDocument("definitions-null", "1 + 2");

        const location = await findDefinitionLocation(
            document,
            { line: 0, character: 0 },
            workspaceService,
        );

        expect(location).toBeNull();
    });

    it("resolves URI-qualified function calls to matching declarations", async () => {
        const document = testDocumentFromUri(
            [
                'xquery version "3.1";',
                "declare function Q{https://example.com}f() {",
                "  1",
                "};",
                "Q{https://example.com}f()",
            ],
            {
                uri: "file:///definitions-uri-qualified.xq",
                languageId: "xquery",
            },
        );

        const location = await findDefinitionLocation(
            document,
            positionAtNth(document, "Q{https://example.com}f", 1),
            workspaceService,
        );

        expect(location).toBeDefined();
        expect(location?.range.start).toEqual({
            line: 1,
            character: "declare function ".length,
        });
    });
});

describe("schema go-to-definition", () => {
    it("keeps schema symbols resolvable when their source file is unavailable", async () => {
        const name = { namespaceUri: "urn:test", localName: "Code" };
        const wrapper = createMockWrapperClient({
            sendRequest: vi.fn().mockResolvedValue({
                id: 1,
                responseType: "schema-catalog",
                body: {
                    types: [{ name }],
                    constructors: [
                        {
                            name: { qname: name, arity: 1 },
                            signature: {
                                parameterTypes: [],
                                returnType: { itemType: { kind: "named", name }, arity: "?" },
                            },
                        },
                    ],
                    errors: [],
                },
                error: null,
            }),
        });
        const { workspace } = createServerContext({} as Connection, wrapper);
        const document = testDocument("schema-definition-without-source", [
            'import schema namespace t = "urn:test";',
            'declare variable $value as t:Code := t:Code("a");',
            "$value",
        ]);
        const analysis = await workspace.getAnalysis(document);
        // Missing provenance must not remove types or constructors from semantic resolution.
        for (const reference of ["t:Code :=", 't:Code("a")']) {
            const position = positionAt(document, reference);
            expect(findSymbolAtPosition(analysis, position)?.declaration?.origin).toBe("schema");
            expect(await findDefinitionLocation(document, position, workspace)).toBeNull();
        }
    });
});
