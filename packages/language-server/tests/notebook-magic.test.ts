import { supportsDocument } from "server/parser/registry.js";
import { describe, expect, it } from "vitest";

import { parserService } from "./services.js";
import { testDocumentFromUri } from "./test-utils.js";

describe("JSONiq notebook magic", () => {
    it("accepts a leading %%jsoniq line in notebook cells", () => {
        const document = testDocumentFromUri(["%%jsoniq", "let $x := 1 return $x"], {
            uri: "vscode-notebook-cell:/test.ipynb#12345",
            languageId: "python",
        });

        expect(parserService.parse(document).diagnostics).toEqual([]);
    });

    it("only enables JSONiq support for notebook cells that start with %%jsoniq", () => {
        const document = testDocumentFromUri(["let $x := 1 return $x"], {
            uri: "vscode-notebook-cell:/test.ipynb#12345",
            languageId: "python",
        });

        expect(supportsDocument(document)).toBe(false);
    });

    it("does not treat %%jsoniq as valid syntax in regular files", () => {
        const document = testDocumentFromUri(["%%jsoniq", "let $x := 1 return $x"], {
            uri: "file:///test.jq",
        });

        expect(parserService.parse(document).diagnostics).not.toEqual([]);
    });
});
