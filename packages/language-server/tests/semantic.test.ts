import { collectSemanticTokens } from "server/lsp/features/semantic-tokens.js";
import { describe, expect, it } from "vitest";

import { workspaceService } from "./services.js";
import { testDocument } from "./test-utils.js";

describe("JSONiq semantic diagnostics", () => {
    it("reports unresolved variable references", () => {
        const document = testDocument("semantic-unresolved", [
            "declare function local:f($x) {",
            "  $x + $missing",
            "};",
        ]);

        const diagnostics = workspaceService.getAnalysis(document).diagnostics;

        expect(diagnostics.map((diagnostic) => diagnostic.code)).toEqual(["unresolved-variable"]);
    });

    it("does not highlight catch syntax as implicit variable declarations", () => {
        const document = testDocument("semantic-catch-variables", [
            "try { 1 div 0 }",
            "catch * { $err:code, $err:description }",
        ]);

        const tokens = collectSemanticTokens(document, workspaceService);

        expect(tokens.data).toEqual([
            1,
            10,
            9,
            2,
            1, // $err:code
            0,
            11,
            16,
            2,
            1, // $err:description
        ]);
    });
});
