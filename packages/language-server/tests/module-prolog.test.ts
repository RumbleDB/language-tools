import { collectModuleProlog, definitionNameToString } from "server/analysis/index.js";
import { describe, expect, it } from "vitest";

import { parserService } from "./services.js";
import { testDocumentFromUri } from "./test-utils.js";

describe.each(["jsoniq", "xquery"])("%s prolog collection", (languageId) => {
    it.each([
        "function($local) { $local }",
        "typeswitch (1) case $local as xs:integer return $local default $fallback return 0",
        "let $local := 1 return $local",
        "some $local in 1 satisfies $local eq 1",
        "try { 1 } catch * { let $local := 2 return $local }",
    ])("collects declarations from the prolog without collecting '%s'", (body) => {
        const document = testDocumentFromUri(
            [
                'declare namespace app = "urn:app";',
                "declare variable $app:global := 1;",
                "declare function app:f($parameter) { let $local := $parameter return $local };",
                body,
            ],
            { uri: `file:///prolog-body-${encodeURIComponent(body)}.${languageId}`, languageId },
        );
        const parsed = parserService.parse(document);
        expect(parsed.diagnostics).toEqual([]);
        const prolog = collectModuleProlog(document.uri, parsed.ast);

        expect(
            [...prolog.declarations.variables.values()].map((definition) =>
                definitionNameToString(definition),
            ),
        ).toEqual(["$app:global"]);
        expect(
            [...prolog.declarations.functions.values()].map((definition) =>
                definitionNameToString(definition),
            ),
        ).toEqual(["app:f#1"]);
        expect(prolog.diagnostics).toEqual([]);
    });

    it("collects a library module's prolog without exporting initializer or function locals", () => {
        const document = testDocumentFromUri(
            [
                'module namespace lib = "urn:lib";',
                'import module namespace dep = "urn:dep" at "dep.jq";',
                "declare variable $lib:value := function($lib:local) { $lib:local };",
                "declare function lib:f($local) { some $inner in $local satisfies $inner eq 1 };",
            ],
            { uri: `file:///prolog-library.${languageId}`, languageId },
        );
        const parsed = parserService.parse(document);
        expect(parsed.diagnostics).toEqual([]);
        const prolog = collectModuleProlog(document.uri, parsed.ast);

        expect(prolog.targetNamespace).toBe("urn:lib");
        expect(prolog.imports).toMatchObject([{ prefix: "dep", namespaceUri: "urn:dep" }]);
        expect(
            [...prolog.exports.values()].map((definition) => definitionNameToString(definition)),
        ).toEqual(["$lib:value", "lib:f#1"]);
        expect(
            [...prolog.declarations.variables.values()].map((definition) =>
                definitionNameToString(definition),
            ),
        ).toEqual(["$lib:value"]);
        expect(prolog.diagnostics).toEqual([]);
    });
});
