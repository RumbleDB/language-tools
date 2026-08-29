import { buildRenameWorkspaceEdit, prepareRename } from "server/lsp/features/rename.js";
import { describe, expect, it } from "vitest";

import { workspaceService } from "./services.js";
import { positionAt, positionAtNth, testDocument, testDocumentFromUri } from "./test-utils.js";

describe("JSONiq rename", () => {
    it("prepares rename placeholder for variables and functions", () => {
        const source = [
            "declare function local:greet($name) { $name };",
            "let $x := 1 return $x",
        ].join("\n");
        const document = testDocument("rename-prepare", source);

        const fnPrepare = prepareRename(
            document,
            positionAt(document, "local:greet"),
            workspaceService,
        );
        const varPrepare = prepareRename(document, positionAt(document, "$x"), workspaceService);

        expect(fnPrepare?.placeholder).toBe("greet");
        expect(varPrepare?.placeholder).toBe("x");
    });

    it("renames variables across scopes (accepting both '$name' and bare 'name')", async () => {
        const source = [
            "declare variable $x := 10;",
            "declare function local:f($x) { $x + 1 };",
            "local:f($x)",
        ].join("\n");
        const document = testDocument("rename-variable", source);

        // Rename inner parameter using bare name "param"
        const innerEdit = await buildRenameWorkspaceEdit(
            document,
            positionAtNth(document, "$x", 1),
            "param",
            workspaceService,
        );
        const innerEdits = innerEdit?.changes?.[document.uri] ?? [];
        expect(innerEdits).toHaveLength(2);
        expect(innerEdits.every((e) => e.newText === "$param")).toBe(true);

        // Rename outer variable using "$renamed"
        const outerEdit = await buildRenameWorkspaceEdit(
            document,
            positionAtNth(document, "$x", 0),
            "$renamed",
            workspaceService,
        );
        const outerEdits = outerEdit?.changes?.[document.uri] ?? [];
        expect(outerEdits).toHaveLength(2);
        expect(outerEdits.every((e) => e.newText === "$renamed")).toBe(true);
    });

    it("renames functions and call sites (accepting both 'name' and 'prefix:name')", async () => {
        const source = [
            "declare function local:add($a, $b) { $a + $b };",
            "local:add(1, 2),",
            "local:add(3, 4)",
        ].join("\n");
        const document = testDocument("rename-fn-calls", source);

        const workspaceEdit = await buildRenameWorkspaceEdit(
            document,
            positionAt(document, "local:add"),
            "local:sum",
            workspaceService,
        );

        expect(workspaceEdit).not.toBeNull();
        const edits = workspaceEdit?.changes?.[document.uri] ?? [];
        expect(edits).toHaveLength(3);
        expect(edits.every((edit) => edit.newText === "local:sum")).toBe(true);
    });

    it("renames URI-qualified functions and custom schema types", async () => {
        const xqDoc = testDocumentFromUri(
            [
                'xquery version "3.1";',
                "declare function Q{https://example.com}calc() { 1 };",
                "Q{https://example.com}calc()",
            ],
            { uri: "file:///rename-uri.xq", languageId: "xquery" },
        );
        const xqEdit = await buildRenameWorkspaceEdit(
            xqDoc,
            positionAt(xqDoc, "Q{https://example.com}calc"),
            "compute",
            workspaceService,
        );
        expect(xqEdit?.changes?.[xqDoc.uri]?.[0]?.newText).toBe("Q{https://example.com}compute");

        const typeDoc = testDocument(
            "rename-type",
            "declare type local:Person as { name: string }; declare function local:check($p as local:Person) { $p };",
        );
        const typeEdit = await buildRenameWorkspaceEdit(
            typeDoc,
            positionAt(typeDoc, "local:Person"),
            "Customer",
            workspaceService,
        );
        expect(typeEdit?.changes?.[typeDoc.uri]).toHaveLength(2);
        expect(typeEdit?.changes?.[typeDoc.uri]?.every((e) => e.newText === "local:Customer")).toBe(
            true,
        );
    });

    it("returns null for non-renameable cursor positions", async () => {
        const document = testDocument("rename-miss", "1 + 1");
        const edit = await buildRenameWorkspaceEdit(
            document,
            positionAt(document, "+"),
            "name",
            workspaceService,
        );
        expect(edit).toBeNull();
    });

    it("rejects invalid identifier names", async () => {
        const document = testDocument(
            "rename-invalid",
            "declare function local:f($x) { $x }; let $y := 1 return $y",
        );

        // empty
        await expect(
            buildRenameWorkspaceEdit(
                document,
                positionAt(document, "local:f"),
                "",
                workspaceService,
            ),
        ).rejects.toThrow("cannot be empty");

        // function with $
        await expect(
            buildRenameWorkspaceEdit(
                document,
                positionAt(document, "local:f"),
                "$bad",
                workspaceService,
            ),
        ).rejects.toThrow("must not start with '$'");

        // arity suffix
        await expect(
            buildRenameWorkspaceEdit(
                document,
                positionAt(document, "local:f"),
                "f#2",
                workspaceService,
            ),
        ).rejects.toThrow("arity suffix");

        // invalid characters
        await expect(
            buildRenameWorkspaceEdit(
                document,
                positionAt(document, "local:f"),
                "f@bad",
                workspaceService,
            ),
        ).rejects.toThrow("Invalid identifier");

        // prefix mismatch
        await expect(
            buildRenameWorkspaceEdit(
                document,
                positionAt(document, "local:f"),
                "other:f",
                workspaceService,
            ),
        ).rejects.toThrow("Cannot change namespace prefix");

        // adding prefix to unprefixed identifier
        await expect(
            buildRenameWorkspaceEdit(
                document,
                positionAt(document, "$y"),
                "$local:z",
                workspaceService,
            ),
        ).rejects.toThrow("Cannot add namespace prefix");
    });
});
