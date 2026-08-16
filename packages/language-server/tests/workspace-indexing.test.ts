import { mkdtemp, rm, unlink, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";

import { buildDocumentIndex } from "server/analysis/document-index.js";
import { WorkspaceDocumentStore } from "server/workspace/document-store.js";
import { loadSourceFile } from "server/workspace/files.js";
import { WorkspaceIndex } from "server/workspace/workspace-index.js";
import { describe, expect, it } from "vitest";
import { TextDocument } from "vscode-languageserver-textdocument";
import { FileChangeType } from "vscode-languageserver/node";

import { parserService } from "./services.js";

const buildIndex = (document: TextDocument) =>
    buildDocumentIndex(document, parserService.parse(document).ast);

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
        const coordinator = new WorkspaceIndex(parserService, new FailingDocumentStore());
        const analysis = coordinator.getAnalysis(validDocument);

        expect(() => coordinator.replaceWorkspaceDocuments([failingUri, validUri])).not.toThrow();
        expect(failedLoads).toBe(0); /// The failing document is not loaded until a definition is requested.
        const definition = analysis.definitions.find((candidate) => candidate.kind === "variable");
        expect(definition).toBeDefined();
        if (definition === undefined) return;
        coordinator.getReferencesToDefinition(definition);

        coordinator.updateOpenDocument(
            TextDocument.create(validUri, "jsoniq", 1, validDocument.getText()),
        );
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
            const workspaceIndex = new WorkspaceIndex(parserService);
            workspaceIndex.replaceWorkspaceDocuments([importerUri]);

            await writeFile(
                modulePath,
                [
                    'module namespace library = "urn:workspace-library";',
                    "declare variable $library:value := 1;",
                ].join("\n"),
            );
            workspaceIndex.updateWorkspaceDocuments([
                { uri: moduleUri, type: FileChangeType.Created },
            ]);

            const moduleDocument = loadSourceFile(moduleUri);
            expect(moduleDocument).toBeDefined();
            if (moduleDocument === undefined) return;
            const definition = buildIndex(moduleDocument).definitions.find(
                (candidate) => candidate.kind === "variable",
            );
            expect(definition).toBeDefined();
            if (definition === undefined) return;
            expect(workspaceIndex.getReferencesToDefinition(definition)).toContainEqual(
                expect.objectContaining({ uri: importerUri }),
            );
        } finally {
            await rm(directory, { recursive: true, force: true });
        }
    });

    it("removes stale references as workspace documents change", async () => {
        const directory = await mkdtemp(path.join(os.tmpdir(), "jsoniq-workspace-lifecycle-"));
        try {
            const importerPath = path.join(directory, "main.jq");
            const modulePath = path.join(directory, "library.jq");
            const importerUri = pathToFileURL(importerPath).toString();
            const moduleUri = pathToFileURL(modulePath).toString();
            const importSource = [
                'import module namespace library = "urn:workspace-library" at "library.jq";',
                "$library:value",
            ].join("\n");
            await writeFile(importerPath, importSource);
            await writeFile(
                modulePath,
                [
                    'module namespace library = "urn:workspace-library";',
                    "declare variable $library:value := 1;",
                ].join("\n"),
            );

            const coordinator = new WorkspaceIndex(parserService);
            coordinator.replaceWorkspaceDocuments([importerUri, moduleUri]);
            const moduleDocument = loadSourceFile(moduleUri);
            expect(moduleDocument).toBeDefined();
            if (moduleDocument === undefined) return;
            const definition = buildIndex(moduleDocument).definitions.find(
                (candidate) => candidate.kind === "variable",
            );
            expect(definition).toBeDefined();
            if (definition === undefined) return;

            expect(coordinator.getReferencesToDefinition(definition)).toContainEqual(
                expect.objectContaining({ uri: importerUri }),
            );

            await writeFile(importerPath, "1");
            coordinator.updateWorkspaceDocuments([
                { uri: importerUri, type: FileChangeType.Changed },
            ]);
            expect(coordinator.getReferencesToDefinition(definition)).toEqual([]);

            await writeFile(importerPath, importSource);
            coordinator.updateWorkspaceDocuments([
                { uri: importerUri, type: FileChangeType.Changed },
            ]);
            expect(coordinator.getReferencesToDefinition(definition)).toContainEqual(
                expect.objectContaining({ uri: importerUri }),
            );

            coordinator.replaceWorkspaceDocuments([moduleUri]);
            expect(coordinator.getReferencesToDefinition(definition)).toEqual([]);

            coordinator.replaceWorkspaceDocuments([importerUri, moduleUri]);
            await unlink(modulePath);
            coordinator.updateWorkspaceDocuments([
                { uri: moduleUri, type: FileChangeType.Deleted },
            ]);
            expect(coordinator.getReferencesToDefinition(definition)).toEqual([]);
        } finally {
            await rm(directory, { recursive: true, force: true });
        }
    });
});
