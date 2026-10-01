import { getDefinitions } from "server/analysis/index.js";
import { ParserService } from "server/parser/index.js";
import { WorkspaceIndex } from "server/workspace/workspace-index.js";
import { describe, expect, it } from "vitest";
import { TextDocument } from "vscode-languageserver-textdocument";

import { testDocument } from "./test-utils.js";

describe("asynchronous workspace analysis", () => {
    it("shares the analysis result between concurrent and subsequent requests", async () => {
        const index = new WorkspaceIndex(new ParserService());
        const document = testDocument("shared-analysis", "declare variable $value := 1; $value");
        const first = index.getAnalysis(document);
        const second = index.getAnalysis(document);
        const analysis = await first;

        expect(await second).toBe(analysis);
        expect(await index.getAnalysis(document)).toBe(analysis);
        expect(analysis.diagnostics).toEqual([]);
    });

    it("keeps document snapshots and prevents stale work from updating the symbol index", async () => {
        const index = new WorkspaceIndex(new ParserService());
        const document = testDocument("changing-analysis", "declare variable $old := 1; $old");
        const oldRequest = index.getAnalysis(document);
        TextDocument.update(document, [{ text: "declare variable $current := 2; $current" }], 2);
        const currentRequest = index.getAnalysis(document);
        const old = await oldRequest;
        const current = await currentRequest;

        expect(
            [...getDefinitions(old.ast)].find((definition) => definition.kind === "variable")?.name,
        ).toMatchObject({ localName: "old" });
        expect(await index.getAnalysis(document)).toBe(current);
        const variable = [...getDefinitions(current.ast)].find(
            (definition) => definition.kind === "variable",
        )!;
        expect(variable.name).toMatchObject({ localName: "current" });
        expect(await index.getReferencesToDefinition(variable)).toHaveLength(1);
    });

    it("invalidates pending work when a document is closed and reopened at the same version", async () => {
        const parser = new ParserService();
        const index = new WorkspaceIndex(parser);
        const document = testDocument("reopened-analysis", "declare variable $old := 1; $old");
        const oldRequest = index.getAnalysis(document);
        index.removeOpenDocument(document.uri);
        parser.clear(document.uri); // Matches the server's document-close handler.
        const reopened = testDocument(
            "reopened-analysis",
            "declare variable $current := 2; $current",
        );
        const currentRequest = index.getAnalysis(reopened);
        await oldRequest;
        const current = await currentRequest;

        expect(await index.getAnalysis(reopened)).toBe(current);
        const variable = [...getDefinitions(current.ast)].find(
            (definition) => definition.kind === "variable",
        )!;
        expect(variable.name).toMatchObject({ localName: "current" });
        expect(await index.getReferencesToDefinition(variable)).toHaveLength(1);
    });
});
