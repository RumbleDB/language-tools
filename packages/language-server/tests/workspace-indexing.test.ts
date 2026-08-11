import { mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";

import { indexWorkspaceDocuments, updateWorkspaceDocuments } from "server/analysis/service.js";
import { loadSourceFile } from "server/analysis/workspace-files.js";
import { findReferenceLocations } from "server/references.js";
import { describe, expect, it } from "vitest";

import { positionAt } from "./test-utils.js";

describe("workspace indexing", () => {
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
