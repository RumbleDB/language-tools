import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";

import {
    discoverWorkspaceDocumentUris,
    languageIdForWorkspacePath,
    loadSourceFile,
} from "server/workspace/files.js";
import { afterEach, describe, expect, it } from "vitest";

const temporaryDirectories: string[] = [];

afterEach(async () => {
    await Promise.all(
        temporaryDirectories
            .splice(0)
            .map((directory) => rm(directory, { recursive: true, force: true })),
    );
});

describe("workspace files", () => {
    it("maps every supported source extension to its language", () => {
        expect(languageIdForWorkspacePath("module.jq")).toBe("jsoniq");
        expect(languageIdForWorkspacePath("module.jsoniq")).toBe("jsoniq");
        expect(languageIdForWorkspacePath("module.jqm")).toBe("jsoniq");
        expect(languageIdForWorkspacePath("module.xq")).toBe("xquery");
        expect(languageIdForWorkspacePath("module.xqy")).toBe("xquery");
        expect(languageIdForWorkspacePath("module.xquery")).toBe("xquery");
        expect(languageIdForWorkspacePath("module.xqm")).toBe("xquery");
        expect(languageIdForWorkspacePath("module.txt")).toBeUndefined();
    });

    it("discovers supported workspace documents without dependency directories", async () => {
        const directory = await mkdtemp(path.join(os.tmpdir(), "jsoniq-workspace-files-"));
        temporaryDirectories.push(directory);
        await mkdir(path.join(directory, "nested"));
        await mkdir(path.join(directory, "node_modules"));
        await writeFile(path.join(directory, "main.jq"), "1");
        await writeFile(path.join(directory, "nested", "module.xqm"), "module namespace m = 'm';");
        await writeFile(path.join(directory, "nested", "notes.txt"), "ignored");
        await writeFile(path.join(directory, "node_modules", "dependency.jq"), "ignored");

        const uris = await discoverWorkspaceDocumentUris([pathToFileURL(directory).toString()]);

        expect(new Set(uris)).toEqual(
            new Set([
                pathToFileURL(path.join(directory, "main.jq")).toString(),
                pathToFileURL(path.join(directory, "nested", "module.xqm")).toString(),
            ]),
        );
    });

    it("loads a supported file as a version-zero document", async () => {
        const directory = await mkdtemp(path.join(os.tmpdir(), "jsoniq-workspace-load-"));
        temporaryDirectories.push(directory);
        const filePath = path.join(directory, "module.xquery");
        await writeFile(filePath, "1 + 1");

        expect(loadSourceFile(pathToFileURL(filePath).toString())).toMatchObject({
            languageId: "xquery",
            version: 0,
        });
    });

    it("loads an explicitly addressed source with an unknown extension", async () => {
        const directory = await mkdtemp(path.join(os.tmpdir(), "jsoniq-module-load-"));
        temporaryDirectories.push(directory);
        const filePath = path.join(directory, "module.lib");
        await writeFile(filePath, "1 + 1");

        expect(loadSourceFile(pathToFileURL(filePath).toString())).toMatchObject({
            languageId: "jsoniq",
            version: 0,
        });
    });
});
