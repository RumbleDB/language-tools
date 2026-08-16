import { readFileSync } from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";

import {
    analyzeDocument,
    collectModuleProlog,
    definitionNameToString,
} from "server/analysis/index.js";
import { findDefinitionLocation } from "server/lsp/features/definition.js";
import { findReferenceLocations } from "server/lsp/features/references.js";
import { buildRenameWorkspaceEdit } from "server/lsp/features/rename.js";
import { describe, expect, it } from "vitest";

import { parserService, workspaceService } from "./services.js";
import { positionAt, testDocument, testDocumentFromUri } from "./test-utils.js";

describe("module imports", () => {
    it("reports a directory import location without failing analysis", () => {
        const document = testDocument("directory-module-import", [
            'import module namespace directory = "urn:directory" at ".";',
            "1",
        ]);

        expect(workspaceService.getAnalysis(document).diagnostics).toContainEqual(
            expect.objectContaining({ code: "XQST0059" }),
        );
    });

    it("records the library module interface explicitly", () => {
        const document = testDocument("module-interface", [
            'module namespace lib = "urn:lib";',
            'import module namespace dep = "urn:dep" at "dep.jq";',
            'declare namespace other = "urn:other";',
            "declare variable $lib:value := 1;",
            "declare %private variable $lib:secret := 2;",
            "declare variable $other:invalid := 3;",
            'declare type lib:Item as { "value": "string" };',
            "declare function lib:identity($value) { $value };",
        ]);
        const ast = parserService.parse(document).ast;
        const prolog = collectModuleProlog(document.uri, ast);
        const analysis = analyzeDocument(document, ast);

        expect(prolog).toMatchObject({
            targetNamespace: "urn:lib",
            imports: [{ prefix: "dep", namespaceUri: "urn:dep" }],
        });
        expect(
            [...prolog.exports.values()].map((definition) => definitionNameToString(definition)),
        ).toEqual(["$lib:value", "lib:Item", "lib:identity#1"]);
        expect(analysis.diagnostics).toContainEqual(expect.objectContaining({ code: "XQST0048" }));
    });

    it("indexes unique exports and diagnoses duplicates in the library module", () => {
        const document = testDocument("duplicate-library-exports", [
            'module namespace lib = "urn:lib";',
            "declare variable $lib:value := 1;",
            "declare variable $lib:value := 2;",
            "declare function lib:value() { 1 };",
            "declare function lib:value() { 2 };",
        ]);

        const prolog = collectModuleProlog(document.uri, parserService.parse(document).ast);

        expect([...prolog.exports.keys()]).toEqual(["$Q{urn:lib}value", "Q{urn:lib}value#0"]);
        expect(analyzeDocument(document, parserService.parse(document).ast).diagnostics).toEqual([
            expect.objectContaining({ code: "XQST0049" }),
            expect.objectContaining({ code: "XQST0034" }),
        ]);
    });

    it("resolves direct imported functions and variables from a relative location", async () => {
        const fixture = path.join(process.cwd(), "tests", "samples", "modules", "imported.xqm");
        const document = testDocumentFromUri(
            [
                'import module namespace use = "urn:language-server:test" at "imported.xqm";',
                "use:double($use:answer) + $value",
            ],
            { uri: pathToFileURL(path.join(path.dirname(fixture), "main.jq")).toString() },
        );

        const analysis = workspaceService.getAnalysis(document);
        expect(analysis.diagnostics).toEqual([
            expect.objectContaining({
                code: "unresolved-variable",
                message: "Reference to undefined variable 'value'",
            }),
        ]);
        expect(
            findDefinitionLocation(document, positionAt(document, "use:double"), workspaceService)
                ?.uri,
        ).toBe(pathToFileURL(fixture).toString());
        expect(
            findDefinitionLocation(document, positionAt(document, "$use:answer"), workspaceService)
                ?.uri,
        ).toBe(pathToFileURL(fixture).toString());

        const rename = await buildRenameWorkspaceEdit(
            document,
            positionAt(document, "$use:answer"),
            "$renamed",
            workspaceService,
        );
        expect(rename?.changes?.[document.uri]).toEqual([
            expect.objectContaining({ newText: "$use:renamed" }),
        ]);
        expect(rename?.changes?.[pathToFileURL(fixture).toString()]).toEqual([
            expect.objectContaining({ newText: "$lib:renamed" }),
        ]);
    });

    it("imports RumbleDB user-defined types from library modules", () => {
        const fixture = path.join(process.cwd(), "tests", "samples", "modules", "typed.jq");
        const document = testDocumentFromUri(
            [
                'import module namespace typed = "urn:language-server:typed" at "typed.jq";',
                "declare variable $value as typed:Item := {};",
                "$value",
            ],
            { uri: pathToFileURL(path.join(path.dirname(fixture), "typed-main.jq")).toString() },
        );

        const analysis = workspaceService.getAnalysis(document);
        expect(analysis.diagnostics).toEqual([]);
        expect(
            findDefinitionLocation(document, positionAt(document, "typed:Item"), workspaceService)
                ?.uri,
        ).toBe(pathToFileURL(fixture).toString());
    });

    it("resolves the Rumble-style module namespace used by ImportMath.jq", async () => {
        const fixture = path.join(process.cwd(), "tests", "samples", "modules", "math.jq");
        const document = testDocumentFromUri(
            [
                'import module namespace math = "math.jq" at "./math.jq";',
                "2 + 2 + $math:x + math:func(1)",
            ],
            { uri: pathToFileURL(path.join(path.dirname(fixture), "ImportMath.jq")).toString() },
        );

        expect(workspaceService.getAnalysis(document).diagnostics).toEqual([]);
        expect(
            findDefinitionLocation(document, positionAt(document, "$math:x"), workspaceService)
                ?.uri,
        ).toBe(pathToFileURL(fixture).toString());
        expect(
            findDefinitionLocation(document, positionAt(document, "math:func"), workspaceService)
                ?.uri,
        ).toBe(pathToFileURL(fixture).toString());

        expect(
            await findReferenceLocations(
                document,
                positionAt(document, "$math:x"),
                true,
                workspaceService,
            ),
        ).toEqual([
            expect.objectContaining({ uri: pathToFileURL(fixture).toString() }),
            expect.objectContaining({ uri: document.uri }),
        ]);
    });

    it("keeps importer references indexed after opening the imported module", async () => {
        const fixture = path.join(process.cwd(), "tests", "samples", "modules", "math.jq");
        const moduleUri = pathToFileURL(fixture).toString();
        const importer = testDocumentFromUri(
            ['import module namespace math = "math.jq" at "./math.jq";', "$math:x"],
            {
                uri: pathToFileURL(
                    path.join(path.dirname(fixture), "references-after-open.jq"),
                ).toString(),
            },
        );

        workspaceService.getAnalysis(importer);

        const moduleDocument = testDocumentFromUri(readFileSync(fixture, "utf8"), {
            uri: moduleUri,
            version: 1,
        });
        workspaceService.getAnalysis(moduleDocument);

        expect(
            await findReferenceLocations(
                moduleDocument,
                positionAt(moduleDocument, "$math:x"),
                false,
                workspaceService,
            ),
        ).toContainEqual(expect.objectContaining({ uri: importer.uri }));
    });

    it("finds references in an unopened workspace importer", async () => {
        const directory = path.join(process.cwd(), "tests", "samples", "modules");
        const moduleUri = pathToFileURL(path.join(directory, "math.jq")).toString();
        const importerUri = pathToFileURL(
            path.join(directory, "workspace-reference-main.jq"),
        ).toString();
        try {
            await workspaceService.setWorkspaceFolders([pathToFileURL(directory).toString()]);
            const moduleDocument = testDocumentFromUri(
                readFileSync(path.join(directory, "math.jq"), "utf8"),
                {
                    uri: moduleUri,
                },
            );

            expect(
                await findReferenceLocations(
                    moduleDocument,
                    positionAt(moduleDocument, "$math:x"),
                    false,
                    workspaceService,
                ),
            ).toContainEqual(expect.objectContaining({ uri: importerUri }));
        } finally {
            await workspaceService.setWorkspaceFolders([]);
        }
    });

    it("does not import private module declarations", () => {
        const fixture = path.join(process.cwd(), "tests", "samples", "modules", "math.jq");
        const document = testDocumentFromUri(
            [
                'import module namespace math = "math.jq" at "./math.jq";',
                "$math:secret + math:hidden()",
            ],
            {
                uri: pathToFileURL(
                    path.join(path.dirname(fixture), "private-import.jq"),
                ).toString(),
            },
        );

        expect(workspaceService.getAnalysis(document).diagnostics).toEqual([
            expect.objectContaining({ code: "unresolved-variable" }),
            expect.objectContaining({ code: "unresolved-function" }),
        ]);
    });

    it("keeps canonical declarations when module imports form a cycle", async () => {
        const directory = path.join(process.cwd(), "tests", "samples", "modules");
        const moduleUri = pathToFileURL(path.join(directory, "cycle-a.jq")).toString();
        const document = testDocumentFromUri(
            ['import module namespace a = "urn:cycle:a" at "cycle-a.jq";', "$a:x"],
            { uri: pathToFileURL(path.join(directory, "cycle-main.jq")).toString() },
        );

        expect(workspaceService.getAnalysis(document).diagnostics).toEqual([]);
        expect(
            findDefinitionLocation(document, positionAt(document, "$a:x"), workspaceService)?.uri,
        ).toBe(moduleUri);
        expect(
            await findReferenceLocations(
                document,
                positionAt(document, "$a:x"),
                false,
                workspaceService,
            ),
        ).toEqual([
            expect.objectContaining({
                uri: pathToFileURL(path.join(directory, "cycle-b.jq")).toString(),
            }),
            expect.objectContaining({ uri: document.uri }),
        ]);
    });

    it("reports duplicate exports across physical modules", () => {
        const directory = path.join(process.cwd(), "tests", "samples", "modules");
        const document = testDocumentFromUri(
            ['import module namespace math = "math.jq" at "math.jq", "math-extra.jq";', "$math:x"],
            { uri: pathToFileURL(path.join(directory, "duplicate-main.jq")).toString() },
        );

        expect(workspaceService.getAnalysis(document).diagnostics).toEqual([
            expect.objectContaining({ code: "XQST0049" }),
        ]);
    });

    it("reports a missing location while retaining exports from valid locations", () => {
        const directory = path.join(process.cwd(), "tests", "samples", "modules");
        const moduleUri = pathToFileURL(path.join(directory, "math.jq")).toString();
        const document = testDocumentFromUri(
            ['import module namespace math = "math.jq" at "missing.jq", "math.jq";', "$math:x"],
            { uri: pathToFileURL(path.join(directory, "partial-import-main.jq")).toString() },
        );

        expect(workspaceService.getAnalysis(document).diagnostics).toEqual([
            expect.objectContaining({
                code: "XQST0059",
                message: "Cannot resolve module location 'missing.jq'.",
            }),
        ]);
        expect(
            findDefinitionLocation(document, positionAt(document, "$math:x"), workspaceService)
                ?.uri,
        ).toBe(moduleUri);
    });

    it("uses a file-like target namespace as the fallback module location", () => {
        const directory = path.join(process.cwd(), "tests", "samples", "modules");
        const document = testDocumentFromUri(
            ['import module namespace math = "math.jq";', "$math:x"],
            { uri: pathToFileURL(path.join(directory, "no-location-main.jq")).toString() },
        );

        expect(workspaceService.getAnalysis(document).diagnostics).toEqual([]);
        expect(
            findDefinitionLocation(document, positionAt(document, "$math:x"), workspaceService)
                ?.uri,
        ).toBe(pathToFileURL(path.join(directory, "math.jq")).toString());
    });

    it("does not use the target namespace when an explicit location is present", () => {
        const directory = path.join(process.cwd(), "tests", "samples", "modules");
        const document = testDocumentFromUri(
            ['import module namespace math = "math.jq" at "missing.jq";', "$math:x"],
            { uri: pathToFileURL(path.join(directory, "missing-location-main.jq")).toString() },
        );

        expect(workspaceService.getAnalysis(document).diagnostics).toEqual([
            expect.objectContaining({ code: "XQST0059" }),
            expect.objectContaining({ code: "unresolved-variable" }),
        ]);
    });
});
