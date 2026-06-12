import { collectSemanticDiagnostics } from "server/semantic.js";
import { describe, expect, it } from "vitest";

import { testDocument } from "./test-utils.js";

describe("JSONiq semantic diagnostics", () => {
    it("reports unresolved variable references", () => {
        const document = testDocument("semantic-unresolved", [
            "declare function local:f($x) {",
            "  $x + $missing",
            "};",
        ]);

        const diagnostics = collectSemanticDiagnostics(document);

        expect(diagnostics.map((diagnostic) => diagnostic.code)).toEqual(["unresolved-variable"]);
    });
});
