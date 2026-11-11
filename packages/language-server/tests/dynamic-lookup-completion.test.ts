import type { SequenceType } from "server/analysis/index.js";
import type { WrapperClient } from "server/integrations/rumble/client.js";
import { findCompletions } from "server/lsp/features/completion.js";
import { describe, expect, it } from "vitest";
import { CompletionItemKind } from "vscode-languageserver";

import { parserService, workspaceService } from "./services.js";
import { createMockWrapperClient, testDocumentFromUri } from "./test-utils.js";

const wrapper = createMockWrapperClient();

function documentAtCursor(marked: string) {
    const offset = marked.indexOf("¦");
    const document = testDocumentFromUri(marked.replace("¦", ""), {
        uri: `file:///dynamic-lookup-${encodeURIComponent(marked)}.jq`,
    });
    return { document, offset };
}

async function complete(marked: string) {
    const { document, offset } = documentAtCursor(marked);
    return findCompletions(
        document,
        document.positionAt(offset),
        parserService,
        workspaceService,
        wrapper,
    );
}

describe("JSONiq dynamic dot lookup completion", () => {
    it.each(["$obj.$¦", "$obj.($¦)", "$obj.($ke¦)", "$obj.(concat($¦))"])(
        "offers variables in %s",
        async (expression) => {
            const items = await complete('declare variable $key := "name"; ' + expression);
            expect(items.map((item) => item.label)).toContain("$key");
        },
    );

    it.each(["$obj.(¦)", "$obj.(con¦)", "$obj.(fn:¦)", "$obj.(concat('a', con¦))"])(
        "offers functions in %s",
        async (expression) => {
            const items = await complete(expression);
            expect(items.map((item) => item.label)).toContain("fn:concat");
        },
    );

    it.each([
        '$obj.("name" cast as xs:¦)',
        '$obj.("name" treat as xs:¦)',
        '$obj.((function($x as xs:¦) { $x })("name"))',
    ])("offers nested types in %s", async (expression) => {
        const items = await complete('declare variable $obj := {"name": 1}; ' + expression);
        expect(items.map((item) => item.label)).toContain("xs:string");
        expect(items.every((item) => item.kind === CompletionItemKind.Class)).toBe(true);
    });

    it.each(["$obj.¦", "$obj.na¦", "$obj.return¦"])(
        "preserves static field completion in %s",
        (expression) => {
            const { document, offset } = documentAtCursor(expression);
            expect(parserService.collectCompletionIntent(document, offset)).toMatchObject({
                allowObjectLookup: true,
                allowFunctions: false,
                keywords: [],
            });
        },
    );

    it.each(["$obj.¦", "$obj.na¦"])("offers only fields in %s", async (expression) => {
        const { document, offset } = documentAtCursor(
            'declare variable $key := "name"; declare variable $obj := {"name": 1}; ' + expression,
        );
        const objectType: SequenceType = {
            itemType: {
                kind: "object",
                fields: {
                    name: {
                        type: { kind: "named", name: { prefix: "xs", localName: "integer" } },
                        required: true,
                    },
                },
            },
            arity: "",
        };
        const withFields = createMockWrapperClient({
            sendRequest: (async () => ({
                id: 0,
                responseType: "",
                body: { sequenceType: objectType },
                error: null,
            })) as WrapperClient["sendRequest"],
        });
        const items = await findCompletions(
            document,
            document.positionAt(offset),
            parserService,
            workspaceService,
            withFields,
        );
        expect(items.map((item) => item.label)).toEqual(["name"]);
    });

    it("offers no variables after a dot when the fields are unknown", async () => {
        expect(await complete('declare variable $key := "name"; $obj.¦')).toEqual([]);
    });

    it.each(['$obj."na¦me"', '$obj.("na¦me")'])(
        "does not suggest references inside the string in %s",
        async (expression) => {
            expect(await complete(expression)).toEqual([]);
        },
    );
});
