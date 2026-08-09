import path from "node:path";
import { pathToFileURL } from "node:url";

import { getAnalysis } from "server/analysis/service.js";
import { findDefinitionLocation } from "server/definitions.js";
import { describe, expect, it } from "vitest";

import { positionAt, testDocumentFromUri } from "./test-utils.js";

describe("module imports", () => {
    it("resolves direct imported functions and variables from a relative location", () => {
        const fixture = path.join(process.cwd(), "tests", "samples", "modules", "imported.xqm");
        const document = testDocumentFromUri(
            [
                'import module namespace use = "urn:language-server:test" at "imported.xqm";',
                "use:double($use:answer)",
            ],
            { uri: pathToFileURL(path.join(path.dirname(fixture), "main.jq")).toString() },
        );

        const analysis = getAnalysis(document);
        expect(analysis.diagnostics).toEqual([]);
        expect(findDefinitionLocation(document, positionAt(document, "use:double"))?.uri).toBe(
            pathToFileURL(fixture).toString(),
        );
        expect(findDefinitionLocation(document, positionAt(document, "$use:answer"))?.uri).toBe(
            pathToFileURL(fixture).toString(),
        );
    });
});
