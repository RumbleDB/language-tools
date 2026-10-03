import { config, mergeConfiguration } from "server/app/configuration.js";
import { collectCodeLenses, registerCodeLens } from "server/lsp/features/code-lens.js";
import type { FeatureRegistrationContext } from "server/lsp/features/context.js";
import { ParserService } from "server/parser/index.js";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { CodeLensParams, Connection } from "vscode-languageserver/node";

import { testDocumentFromUri } from "./test-utils.js";

describe("Run Query CodeLens", () => {
    const parser = new ParserService();
    const wrapperEnabled = config.wrapper.enabled;

    afterEach(() => {
        mergeConfiguration({ wrapper: { enabled: wrapperEnabled } });
    });

    it.each(["jsoniq", "xquery"])(
        "places one lens at line 0 before comments and the prolog in %s",
        (languageId) => {
            const document = testDocumentFromUri(
                "(: Query :)\n\ndeclare variable $value := 42;\n$value",
                { uri: `file:///query.${languageId === "jsoniq" ? "jq" : "xq"}`, languageId },
            );

            expect(collectCodeLenses(document, parser)).toEqual([
                {
                    range: {
                        start: { line: 0, character: 0 },
                        end: { line: 0, character: 0 },
                    },
                    command: {
                        title: "$(play) Run Query",
                        command: "jsoniq.runQuery",
                        arguments: [document.uri],
                    },
                },
            ]);
        },
    );

    it.each(["jsoniq", "xquery"])("omits library modules in %s", (languageId) => {
        const document = testDocumentFromUri(
            '(: Library :)\nmodule namespace lib = "urn:lib";\ndeclare function lib:value() { 42 };',
            { uri: `file:///library.${languageId === "jsoniq" ? "jqm" : "xqm"}`, languageId },
        );

        expect(collectCodeLenses(document, parser)).toEqual([]);
    });

    it.each(["", " \n\t"])("omits empty documents (%j)", (source) => {
        const document = testDocumentFromUri(source, { uri: "file:///empty.jq" });
        expect(collectCodeLenses(document, parser)).toEqual([]);
    });

    it("keeps the lens available while a query is being edited", () => {
        const document = testDocumentFromUri("for $x in", { uri: "file:///incomplete.jq" });
        expect(collectCodeLenses(document, parser)).toHaveLength(1);
    });

    it("handles missing documents and hides the lens when the wrapper is disabled", () => {
        const onCodeLens = vi.fn();
        const document = testDocumentFromUri("42", { uri: "file:///query.jq" });
        registerCodeLens({
            connection: { onCodeLens } as unknown as Connection,
            documents: { get: (uri) => (uri === document.uri ? document : undefined) },
            parser,
        } as FeatureRegistrationContext);
        const handler = onCodeLens.mock.calls[0]![0] as (params: CodeLensParams) => unknown;

        mergeConfiguration({ wrapper: { enabled: true } });
        expect(handler({ textDocument: { uri: document.uri } })).toHaveLength(1);
        expect(handler({ textDocument: { uri: "file:///missing.jq" } })).toEqual([]);

        mergeConfiguration({ wrapper: { enabled: false } });
        expect(handler({ textDocument: { uri: document.uri } })).toEqual([]);
    });
});
