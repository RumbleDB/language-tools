import { analyzeDocument } from "server/analysis/builder.js";
import { getDefinitions } from "server/analysis/queries.js";
import { WorkspaceSymbolIndex } from "server/workspace/symbol-index.js";
import { describe, expect, it } from "vitest";

import { parserService } from "./services.js";
import { testDocument, testDocumentFromUri } from "./test-utils.js";

const buildAnalysis = (document: Parameters<typeof analyzeDocument>[0]) =>
    analyzeDocument(document, parserService.parse(document).ast);

describe("workspace symbol index", () => {
    it("indexes and removes references by symbol identity", () => {
        const document = testDocument("workspace-symbol", [
            "declare variable $value := 1;",
            "$value",
        ]);
        const analysis = buildAnalysis(document);
        const definition = [...getDefinitions(analysis.ast)].find(
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
        const first = buildAnalysis(
            testDocumentFromUri("declare variable $value := 1;", { uri, version: 1 }),
        );
        const second = buildAnalysis(
            testDocumentFromUri(["", "declare variable $value := 1;"], { uri, version: 2 }),
        );

        const firstVariable = [...getDefinitions(first.ast)].find(
            (definition) => definition.kind === "variable",
        );
        const secondVariable = [...getDefinitions(second.ast)].find(
            (definition) => definition.kind === "variable",
        );
        expect(firstVariable?.selectionRange).not.toEqual(secondVariable?.selectionRange);
        expect(firstVariable?.id).toBe(secondVariable?.id);
    });
});
