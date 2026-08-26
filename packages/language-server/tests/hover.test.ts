import { ERR_NAMESPACE, findNodeThatContainsPosition } from "server/analysis/index.js";
import { findHover } from "server/lsp/features/hover.js";
import { describe, expect, it } from "vitest";

import { workspaceService, wrapperClient } from "./services.js";
import { positionAt, testDocument, testDocumentFromUri } from "./test-utils.js";

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

    it("keeps wildcard catch targets as syntax-aware AST nodes", () => {
        const document = testDocument(
            "hover-error-code-wildcard",
            "try { 1 div 0 } catch err:* { 0 }",
        );
        const analysis = workspaceService.getAnalysis(document);

        const node = findNodeThatContainsPosition(analysis, positionAt(document, "err:*"));

        expect(node).toMatchObject({
            kind: "error-code-target",
            target: { kind: "wildcard", value: "err:*" },
        });
    });
});
