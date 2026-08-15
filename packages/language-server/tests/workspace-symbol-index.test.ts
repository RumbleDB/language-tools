import { analyzeDocument } from "server/analysis/builder.js";
import { buildDocumentIndex } from "server/analysis/document-index.js";
import { WorkspaceSymbolIndex } from "server/workspace/symbol-index.js";
import { describe, expect, it } from "vitest";

import { parserService } from "./services.js";
import { testDocument, testDocumentFromUri } from "./test-utils.js";

const buildIndex = (document: Parameters<typeof buildDocumentIndex>[0]) =>
    buildDocumentIndex(document, parserService.parse(document).ast);

describe("workspace symbol index", () => {
    it("indexes and removes references by symbol identity", () => {
        const document = testDocument("workspace-symbol", [
            "declare variable $value := 1;",
            "$value",
        ]);
        const analysis = analyzeDocument(buildIndex(document));
        const definition = analysis.definitions.find(
            (candidate) => candidate.kind === "variable" && candidate.name.localName === "value",
        );
        expect(definition).toBeDefined();
        if (definition === undefined) return;

        const symbols = new WorkspaceSymbolIndex();
        symbols.update(document.uri, analysis);
        expect(symbols.referencesTo(definition)).toHaveLength(1);

        symbols.remove(document.uri);
        expect(symbols.referencesTo(definition)).toEqual([]);
    });

    it("keeps symbol identities stable when declaration ranges move", () => {
        const uri = "file:///stable-symbol.jq";
        const first = buildIndex(
            testDocumentFromUri("declare variable $value := 1;", { uri, version: 1 }),
        );
        const second = buildIndex(
            testDocumentFromUri(["", "declare variable $value := 1;"], { uri, version: 2 }),
        );

        const firstVariable = first.definitions.find(
            (definition) => definition.kind === "variable",
        );
        const secondVariable = second.definitions.find(
            (definition) => definition.kind === "variable",
        );
        expect(firstVariable?.selectionRange).not.toEqual(secondVariable?.selectionRange);
        expect(firstVariable?.id).toBe(secondVariable?.id);
    });
});
