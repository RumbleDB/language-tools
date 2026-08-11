import { mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";

import { WorkspaceDocumentStore } from "server/analysis/module-loader.js";
import {
    indexWorkspaceDocuments,
    updateWorkspaceDocuments,
    WorkspaceAnalysisCoordinator,
} from "server/analysis/service.js";
import { loadSourceFile } from "server/analysis/workspace-files.js";
import { findReferenceLocations } from "server/references.js";
import { describe, expect, it } from "vitest";
import { TextDocument } from "vscode-languageserver-textdocument";

import { positionAt } from "./test-utils.js";

describe("workspace indexing", () => {
    it("isolates and remembers a document loading failure", () => {
        const validUri = "file:///workspace-valid.jq";
        const failingUri = "file:///workspace-failing.jq";
        const validDocument = TextDocument.create(
            validUri,
            "jsoniq",
            0,
            "declare variable $value := 1; $value",
        );
        let failedLoads = 0;
        class FailingDocumentStore extends WorkspaceDocumentStore {
            public override load(uri: string): TextDocument | undefined {
                if (uri === failingUri) {
                    failedLoads += 1;
                    throw new TypeError("Cannot read properties of null (reading 'getText')");
                }
                return uri === validUri ? validDocument : super.load(uri);
            }
        }
        const coordinator = new WorkspaceAnalysisCoordinator(new FailingDocumentStore());
        const analysis = coordinator.getAnalysis(validDocument);

        expect(() => coordinator.indexWorkspaceDocuments([failingUri, validUri])).not.toThrow();
        const definition = analysis.definitions.find((candidate) => candidate.kind === "variable");
        expect(definition).toBeDefined();
        if (definition === undefined) return;
        coordinator.getReferencesToDefinition(definition);

        expect(failedLoads).toBe(1);
    });

    it("reindexes an importer when its missing module is created", async () => {
        const directory = await mkdtemp(path.join(os.tmpdir(), "jsoniq-workspace-index-"));
        try {
            const importerPath = path.join(directory, "main.jq");
            const modulePath = path.join(directory, "library.jq");
            const importerUri = pathToFileURL(importerPath).toString();
            const moduleUri = pathToFileURL(modulePath).toString();
            await writeFile(
                importerPath,
                [
                    'import module namespace library = "urn:workspace-library" at "library.jq";',
                    "$library:value",
                ].join("\n"),
            );
            indexWorkspaceDocuments([importerUri]);

            await writeFile(
                modulePath,
                [
                    'module namespace library = "urn:workspace-library";',
                    "declare variable $library:value := 1;",
                ].join("\n"),
            );
            updateWorkspaceDocuments([{ uri: moduleUri, kind: "created" }]);

            const moduleDocument = loadSourceFile(moduleUri);
            expect(moduleDocument).toBeDefined();
            if (moduleDocument === undefined) return;
            expect(
                findReferenceLocations(
                    moduleDocument,
                    positionAt(moduleDocument, "$library:value"),
                    false,
                ),
            ).toContainEqual(expect.objectContaining({ uri: importerUri }));
        } finally {
            await rm(directory, { recursive: true, force: true });
        }
    });
});
