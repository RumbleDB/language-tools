import { readFileSync } from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";

import { analyzeDocument } from "server/analysis/builder.js";
import { definitionNameToString } from "server/analysis/definitions.js";
import { buildDocumentIndex } from "server/analysis/document-index.js";
import { getAnalysis } from "server/analysis/service.js";
import { findDefinitionLocation } from "server/definitions.js";
import { findReferenceLocations } from "server/references.js";
import { buildRenameWorkspaceEdit } from "server/rename.js";
import { describe, expect, it } from "vitest";

import { positionAt, testDocument, testDocumentFromUri } from "./test-utils.js";

describe("module imports", () => {
    it("reports a directory import location without failing analysis", () => {
        const document = testDocument("directory-module-import", [
            'import module namespace directory = "urn:directory" at ".";',
            "1",
        ]);

        expect(getAnalysis(document).diagnostics).toContainEqual(
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
            "declare function lib:identity($value) { $value };",
        ]);
        const index = buildDocumentIndex(document);
        const analysis = analyzeDocument(index);

        expect(analysis.moduleDeclaration).toBe(index.moduleDeclaration);
        expect(analysis.moduleInterface).toBe(index.moduleInterface);
        expect(analysis.definitions).toBe(index.definitions);
        expect(analysis.moduleDeclaration).toMatchObject({
            kind: "library",
            targetNamespace: { namespaceUri: "urn:lib" },
            imports: [{ prefix: "dep", namespaceUri: "urn:dep" }],
        });
        expect(
            [...(analysis.moduleInterface?.exports.values() ?? [])].map((definition) =>
                definitionNameToString(definition),
            ),
        ).toEqual(["$lib:value", "lib:identity#1"]);
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

        const index = buildDocumentIndex(document);

        expect([...index.moduleInterface!.exports.keys()]).toEqual([
            "$Q{urn:lib}value",
            "Q{urn:lib}value#0",
        ]);
        expect(index.diagnostics).toEqual([
            expect.objectContaining({ code: "XQST0049" }),
            expect.objectContaining({ code: "XQST0034" }),
        ]);
    });

    it("resolves direct imported functions and variables from a relative location", () => {
        const fixture = path.join(process.cwd(), "tests", "samples", "modules", "imported.xqm");
        const document = testDocumentFromUri(
            [
                'import module namespace use = "urn:language-server:test" at "imported.xqm";',
                "use:double($use:answer) + $value",
            ],
            { uri: pathToFileURL(path.join(path.dirname(fixture), "main.jq")).toString() },
        );

        const analysis = getAnalysis(document);
        expect(analysis.diagnostics).toEqual([
            expect.objectContaining({
                code: "unresolved-variable",
                message: "Reference to undefined variable 'value'",
            }),
        ]);
        expect(findDefinitionLocation(document, positionAt(document, "use:double"))?.uri).toBe(
            pathToFileURL(fixture).toString(),
        );
        expect(findDefinitionLocation(document, positionAt(document, "$use:answer"))?.uri).toBe(
            pathToFileURL(fixture).toString(),
        );

        const rename = buildRenameWorkspaceEdit(
            document,
            positionAt(document, "$use:answer"),
            "$renamed",
        );
        expect(rename?.changes?.[document.uri]).toEqual([
            expect.objectContaining({ newText: "$use:renamed" }),
        ]);
        expect(rename?.changes?.[pathToFileURL(fixture).toString()]).toEqual([
            expect.objectContaining({ newText: "$lib:renamed" }),
        ]);
    });

    it("resolves the Rumble-style module namespace used by ImportMath.jq", () => {
        const fixture = path.join(process.cwd(), "tests", "samples", "modules", "math.jq");
        const document = testDocumentFromUri(
            [
                'import module namespace math = "math.jq" at "./math.jq";',
                "2 + 2 + $math:x + math:func(1)",
            ],
            { uri: pathToFileURL(path.join(path.dirname(fixture), "ImportMath.jq")).toString() },
        );

        expect(getAnalysis(document).diagnostics).toEqual([]);
        expect(findDefinitionLocation(document, positionAt(document, "$math:x"))?.uri).toBe(
            pathToFileURL(fixture).toString(),
        );
        expect(findDefinitionLocation(document, positionAt(document, "math:func"))?.uri).toBe(
            pathToFileURL(fixture).toString(),
        );

        expect(findReferenceLocations(document, positionAt(document, "$math:x"), true)).toEqual([
            expect.objectContaining({ uri: pathToFileURL(fixture).toString() }),
            expect.objectContaining({ uri: document.uri }),
        ]);
    });

    it("keeps importer references indexed after opening the imported module", () => {
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

        getAnalysis(importer);

        const moduleDocument = testDocumentFromUri(readFileSync(fixture, "utf8"), {
            uri: moduleUri,
            version: 1,
        });
        getAnalysis(moduleDocument);

        expect(
            findReferenceLocations(moduleDocument, positionAt(moduleDocument, "$math:x"), false),
        ).toContainEqual(expect.objectContaining({ uri: importer.uri }));
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

        expect(getAnalysis(document).diagnostics).toEqual([
            expect.objectContaining({ code: "unresolved-variable" }),
            expect.objectContaining({ code: "unresolved-function" }),
        ]);
    });

    it("keeps canonical declarations when module imports form a cycle", () => {
        const directory = path.join(process.cwd(), "tests", "samples", "modules");
        const moduleUri = pathToFileURL(path.join(directory, "cycle-a.jq")).toString();
        const document = testDocumentFromUri(
            ['import module namespace a = "urn:cycle:a" at "cycle-a.jq";', "$a:x"],
            { uri: pathToFileURL(path.join(directory, "cycle-main.jq")).toString() },
        );

        expect(getAnalysis(document).diagnostics).toEqual([]);
        expect(findDefinitionLocation(document, positionAt(document, "$a:x"))?.uri).toBe(moduleUri);
        expect(findReferenceLocations(document, positionAt(document, "$a:x"), false)).toEqual([
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

        expect(getAnalysis(document).diagnostics).toEqual([
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

        expect(getAnalysis(document).diagnostics).toEqual([
            expect.objectContaining({
                code: "XQST0059",
                message: "Cannot resolve module location 'missing.jq'.",
            }),
        ]);
        expect(findDefinitionLocation(document, positionAt(document, "$math:x"))?.uri).toBe(
            moduleUri,
        );
    });

    it("uses a file-like target namespace as the fallback module location", () => {
        const directory = path.join(process.cwd(), "tests", "samples", "modules");
        const document = testDocumentFromUri(
            ['import module namespace math = "math.jq";', "$math:x"],
            { uri: pathToFileURL(path.join(directory, "no-location-main.jq")).toString() },
        );

        expect(getAnalysis(document).diagnostics).toEqual([]);
        expect(findDefinitionLocation(document, positionAt(document, "$math:x"))?.uri).toBe(
            pathToFileURL(path.join(directory, "math.jq")).toString(),
        );
    });

    it("does not use the target namespace when an explicit location is present", () => {
        const directory = path.join(process.cwd(), "tests", "samples", "modules");
        const document = testDocumentFromUri(
            ['import module namespace math = "math.jq" at "missing.jq";', "$math:x"],
            { uri: pathToFileURL(path.join(directory, "missing-location-main.jq")).toString() },
        );

        expect(getAnalysis(document).diagnostics).toEqual([
            expect.objectContaining({ code: "XQST0059" }),
            expect.objectContaining({ code: "unresolved-variable" }),
        ]);
    });
});
