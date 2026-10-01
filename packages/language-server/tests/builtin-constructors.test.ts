import { findSymbolAtPosition } from "server/analysis/index.js";
import { findCompletions } from "server/lsp/features/completion.js";
import { findHover } from "server/lsp/features/hover.js";
import { findSignatureHelp } from "server/lsp/features/signature-help.js";
import { builtinFunctions } from "server/resources/builtin-functions.js";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { parserService, workspaceService, wrapperClient } from "./services.js";
import { positionAt, testDocumentFromUri } from "./test-utils.js";

beforeEach(() => {
    vi.spyOn(wrapperClient, "isUsable").mockReturnValue(false);
});
afterEach(() => vi.restoreAllMocks());

for (const language of ["jsoniq", "xquery"] as const) {
    describe(`${language} built-in constructors`, () => {
        function document(source: string) {
            return testDocumentFromUri(source, {
                uri: `file:///constructors-${language}-${encodeURIComponent(source)}.${language === "xquery" ? "xq" : "jq"}`,
                languageId: language,
            });
        }

        it("resolves XML Schema constructors and keeps list result types", async () => {
            const source = document('xs:IDREFS("a b")');
            const declaration = findSymbolAtPosition(
                await workspaceService.getAnalysis(source),
                positionAt(source, "IDREFS"),
            )?.declaration;
            expect(declaration).toMatchObject({
                origin: "builtin",
                signature: {
                    returnType: { arity: "*", itemType: { name: { localName: "IDREF" } } },
                },
            });
        });

        it("offers constructors with callable snippets and signatures", async () => {
            const source = document("xs:");
            const items = await findCompletions(
                source,
                source.positionAt(3),
                parserService,
                workspaceService,
                wrapperClient,
            );
            expect(items?.find((item) => item.label === "xs:integer")).toMatchObject({
                insertText: "xs:integer(${1:\\$arg1})$0",
                detail: "xs:integer(xs:anyAtomicType?) as xs:integer? / 1",
            });
        });

        it("shows the exported signature in hover without a running wrapper", async () => {
            const source = document('xs:integer("12")');
            const hover = await findHover(
                source,
                positionAt(source, "integer"),
                workspaceService,
                wrapperClient,
            );
            expect(hover?.contents).toMatchObject({
                value: expect.stringContaining("xs:integer(xs:anyAtomicType?) as xs:integer?"),
            });
        });

        it("shows constructor parameters in signature help", async () => {
            const source = document('xs:integer("12")');
            const help = await findSignatureHelp(
                source,
                positionAt(source, '"12"'),
                workspaceService,
            );
            expect(help?.signatures[0]?.label).toBe(
                "xs:integer($arg1 as xs:anyAtomicType?) as xs:integer?",
            );
            expect(help?.activeParameter).toBe(0);
        });
    });
}

describe("constructor language differences", () => {
    it("uses the JSONiq alias signature in hover and signature help", async () => {
        const source = testDocumentFromUri('integer("12")', { uri: "file:///alias-signature.jq" });
        const hover = await findHover(
            source,
            positionAt(source, "integer"),
            workspaceService,
            wrapperClient,
        );
        expect(hover?.contents).toMatchObject({
            value: expect.stringContaining("integer(xs:anyAtomicType?) as xs:integer?"),
        });
        const help = await findSignatureHelp(source, positionAt(source, '"12"'), workspaceService);
        expect(help?.signatures[0]?.label).toBe(
            "integer($arg1 as xs:anyAtomicType?) as xs:integer?",
        );
    });

    it("offers unprefixed aliases only for JSONiq", async () => {
        for (const language of ["jsoniq", "xquery"] as const) {
            const source = testDocumentFromUri("inte", {
                uri: `file:///aliases-${language}`,
                languageId: language,
            });
            const items = await findCompletions(
                source,
                source.positionAt(4),
                parserService,
                workspaceService,
                wrapperClient,
            );
            expect(items?.some((item) => item.label === "integer")).toBe(language === "jsoniq");
            expect(
                builtinFunctions.find({ qname: { localName: "integer" }, arity: 1 }, language) !==
                    undefined,
            ).toBe(language === "jsoniq");
        }
    });

    it("preserves ordinary boolean and string functions instead of constructor aliases", () => {
        for (const localName of ["boolean", "string", "error"]) {
            expect(
                builtinFunctions.find({ qname: { localName }, arity: 1 }, "jsoniq")?.name.qname
                    .namespaceUri,
            ).toBe("http://www.w3.org/2005/xpath-functions");
        }
        expect(
            builtinFunctions.find({ qname: { localName: "QName" }, arity: 1 }, "jsoniq"),
        ).toBeUndefined();
    });
});
