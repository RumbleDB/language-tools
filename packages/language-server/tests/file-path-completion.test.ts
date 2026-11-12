import { mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";

import { afterAll, describe, expect, it } from "vitest";
import { CompletionItemKind } from "vscode-languageserver";
import { TextDocument } from "vscode-languageserver-textdocument";

import { parserService, workspaceService } from "./services.js";
import { createMockWrapperClient, findCompletions } from "./test-utils.js";

/**
 * A query next to `notes.txt`, a `data` directory with `users.json`, `.hidden` and an `events` directory, a `lib`
 * directory with `module.jq`, `readme.md` and a `nested` directory, and a `linked` link to the `data` directory.
 */
const root = mkdtempSync(path.join(tmpdir(), "jsoniq-file-paths-"));
mkdirSync(path.join(root, "data", "events"), { recursive: true });
writeFileSync(path.join(root, "data", "users.json"), "");
writeFileSync(path.join(root, "notes.txt"), "");
writeFileSync(path.join(root, "data", ".hidden"), "");
mkdirSync(path.join(root, "lib", "nested"), { recursive: true });
writeFileSync(path.join(root, "lib", "module.jq"), "");
writeFileSync(path.join(root, "lib", "readme.md"), "");
symlinkSync(path.join(root, "data"), path.join(root, "linked"));

afterAll(() => rmSync(root, { recursive: true, force: true }));

let documents = 0;

/** Completes where `¦` is, in a query saved in the temporary directory. */
async function complete(query: string, extension = "jq") {
    const text = query.replace("¦", "");
    const uri = pathToFileURL(path.join(root, `query-${documents++}.${extension}`)).href;
    const document = TextDocument.create(uri, extension === "xq" ? "xquery" : "jsoniq", 1, text);
    return findCompletions(
        document,
        document.positionAt(query.indexOf("¦")),
        parserService,
        workspaceService,
        createMockWrapperClient(),
    );
}

const labels = async (query: string) => (await complete(query)).map((item) => item.label).sort();

describe("file path completion", () => {
    it("lists the directory of the query in the first argument of a function that reads files", async () => {
        const items = await complete('json-lines("¦');

        expect(items.map((item) => item.label)).toEqual(
            expect.arrayContaining(["data/", "notes.txt"]),
        );
        expect(items.find((item) => item.label === "data/")).toMatchObject({
            kind: CompletionItemKind.Folder,
            command: { command: "editor.action.triggerSuggest" },
        });
        expect(items.find((item) => item.label === "notes.txt")).toMatchObject({
            kind: CompletionItemKind.File,
        });
    });

    it("lists the directory before the last slash, and replaces the name after it", async () => {
        const items = await complete('json-lines("data/us¦")');

        expect(items.map((item) => item.label).sort()).toEqual(["events/", "users.json"]);
        expect(items.find((item) => item.label === "users.json")?.textEdit).toEqual({
            range: { start: { line: 0, character: 17 }, end: { line: 0, character: 19 } },
            newText: "users.json",
        });
    });

    it("replaces the whole name that the cursor is in", async () => {
        const items = await complete('json-lines("data/us¦ers.json")');

        expect(items.find((item) => item.label === "users.json")?.textEdit).toEqual({
            range: { start: { line: 0, character: 17 }, end: { line: 0, character: 27 } },
            newText: "users.json",
        });
    });

    it("replaces the slash after the name of a directory too", async () => {
        const items = await complete('json-lines("data/ev¦ents/2024.json")');

        expect(items.find((item) => item.label === "events/")?.textEdit).toEqual({
            range: { start: { line: 0, character: 17 }, end: { line: 0, character: 24 } },
            newText: "events/",
        });
    });

    it("lists a link to a directory as a directory", async () => {
        const items = await complete('json-lines("¦');

        expect(items.find((item) => item.label === "linked/")).toMatchObject({
            kind: CompletionItemKind.Folder,
        });
        expect(await labels('json-lines("linked/¦')).toEqual(["events/", "users.json"]);
    });

    it("lists the files that XQuery reads", async () => {
        expect((await complete('doc("data/¦")', "xq")).map((item) => item.label).sort()).toEqual([
            "events/",
            "users.json",
        ]);
    });

    it.each([
        'jn:parquet-file("data/¦',
        'json-doc("data/¦")',
        "json-file('data/¦')",
        'json-lines("data/¦", 10)',
        'let $users := json-lines("data/¦\nreturn $users',
    ])("lists the files of %s", async (query) => {
        expect(await labels(query)).toEqual(["events/", "users.json"]);
    });

    it("lists hidden entries only once their name is being typed", async () => {
        expect(await labels('json-lines("data/.¦')).toEqual([".hidden", "events/", "users.json"]);
    });

    it("resolves relative paths against the declared base URI", async () => {
        expect(await labels('declare base-uri "data/";\njson-lines("¦")')).toEqual([
            "events/",
            "users.json",
        ]);
    });

    it("lists the directory of an absolute path", async () => {
        const directory = pathToFileURL(path.join(root, "data")).href;
        expect(await labels(`json-lines("${directory}/¦")`)).toEqual(["events/", "users.json"]);
    });

    it.each([
        'import module namespace m = "urn:m" at "lib/¦',
        'import module namespace m = "urn:m" at "lib/¦";\n1',
        'import module namespace m = "lib/¦',
        // Modules are located relative to the module that imports them, not to the base URI.
        'declare base-uri "data/";\nimport module namespace m = "urn:m" at "lib/¦";\n1',
    ])("lists the directories and modules of %s", async (query) => {
        expect(await labels(query)).toEqual(["module.jq", "nested/"]);
    });

    it.each([
        'import schema namespace s = "urn:s" at "data/¦',
        'declare base-uri "data/";\nimport schema namespace s = "urn:s" at "¦";\n1',
    ])("lists the files of the schema location in %s", async (query) => {
        expect(await labels(query)).toEqual(["events/", "users.json"]);
    });

    it.each([
        ["a string that no function reads", 'concat("data/¦'],
        ["an argument that is not the path", 'json-lines("data/users.json", "¦'],
        ["a string inside the path argument", 'json-lines(concat("data/¦'],
        ["a directory that does not exist", 'json-lines("missing/¦'],
        ["a path that is not local", 'json-lines("hdfs://host/¦'],
        [
            "the namespace of an import with a location",
            'import module namespace m = "lib/¦" at "lib/module.jq";\n1',
        ],
        ["a comment", '(: json-lines("data/¦ :)'],
    ])("lists nothing in %s", async (_description, query) => {
        expect(await complete(query)).toEqual([]);
    });
});
