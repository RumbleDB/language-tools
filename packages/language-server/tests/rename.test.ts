import { buildRenameWorkspaceEdit, prepareRename } from "server/rename.js";
import { describe, expect, it } from "vitest";

import { positionAt, positionAtNth, testDocument } from "./test-utils.js";

describe("JSONiq rename", () => {
    it("prepares rename over variable references and declarations", () => {
        const source = ["for $x at $pos in (1, 2, 3)", "let $y := $x + 1", "return $x + $y"].join(
            "\n",
        );
        const document = testDocument("rename-prepare", source);

        const prepareOnReference = prepareRename(document, positionAtNth(document, "$x", 1));
        const prepareOnDeclaration = prepareRename(document, positionAtNth(document, "$x", 0));

        expect(prepareOnReference?.placeholder).toBe("$x");
        expect(prepareOnDeclaration?.placeholder).toBe("$x");
    });

    it("renames declaration and all references in the same scope", () => {
        const source = [
            "declare variable $x := 10;",
            "declare function local:f($x) {",
            "  let $y := $x + 1",
            "  return $y + $x",
            "};",
            "local:f($x)",
        ].join("\n");
        const document = testDocument("rename-shadowing", source);

        const workspaceEdit = buildRenameWorkspaceEdit(
            document,
            positionAtNth(document, "$x", 2),
            "$renamed",
        );

        expect(workspaceEdit).not.toBeNull();
        const edits = workspaceEdit?.changes?.[document.uri] ?? [];
        expect(edits).toHaveLength(3);
        expect(edits.every((edit) => edit.newText === "$renamed")).toBe(true);
        expect(edits.map((edit) => edit.range.start.line)).toEqual([1, 2, 3]);
    });

    it("rejects invalid variable names", () => {
        const source = "let $x := 1 return $x";
        const document = testDocument("rename-invalid", source);

        expect(() =>
            buildRenameWorkspaceEdit(document, positionAtNth(document, "$x", 1), "renamed"),
        ).toThrow("must start with '$'");
    });

    it("returns null for non-variable cursor positions", () => {
        const source = "declare function local:f($x) { $x };";
        const document = testDocument("rename-miss", source);

        const workspaceEdit = buildRenameWorkspaceEdit(
            document,
            positionAt(document, "local:f"),
            "$updated",
        );

        expect(workspaceEdit).toBeNull();
    });
});
