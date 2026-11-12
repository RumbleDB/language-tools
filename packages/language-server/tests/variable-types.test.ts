import type { SequenceType } from "server/analysis/index.js";
import { clearStaticTypecheckCache } from "server/integrations/rumble/operations/static-typecheck/service.js";
import type { VariableBinding } from "server/integrations/rumble/operations/static-typecheck/types.js";
import { getLatestVariableTypes } from "server/integrations/rumble/operations/static-typecheck/variable-types.js";
import { findCompletions } from "server/lsp/features/completion.js";
import { describe, expect, it, vi } from "vitest";
import type { Range } from "vscode-languageserver";
import { TextDocument } from "vscode-languageserver-textdocument";

import { parserService, workspaceService, wrapperClient } from "./services.js";
import { createMockWrapperClient } from "./test-utils.js";

const INTEGER: SequenceType = {
    itemType: {
        kind: "named",
        name: {
            namespaceUri: "http://www.w3.org/2001/XMLSchema",
            prefix: "xs",
            localName: "integer",
        },
    },
    arity: "",
};

/** `$a` in `let $a := 1 return $a`, as RumbleDB reports it, including the `$`. */
const A_BINDING: VariableBinding = {
    range: { start: { line: 0, character: 4 }, end: { line: 0, character: 6 } },
    sequenceType: INTEGER,
};

/** `a` in `let $a := 1 return $a`, as the analysis declares it. */
const A_NAME: Range = { start: { line: 0, character: 5 }, end: { line: 0, character: 6 } };

/** A wrapper whose static typechecks are answered when the test says so. */
function deferredWrapper() {
    const answers: Array<(bindings: VariableBinding[]) => void> = [];
    const sendRequest = vi.fn().mockImplementation(
        () =>
            new Promise((resolve) => {
                answers.push((bindings) =>
                    resolve({
                        id: 0,
                        responseType: "static-typecheck",
                        body: { errors: [], bindings },
                        error: null,
                    }),
                );
            }),
    );
    return {
        wrapper: createMockWrapperClient({ sendRequest }),
        sendRequest,
        /** Answers the oldest check, and lets the service take in the answer. */
        answer: async (bindings: VariableBinding[]) => {
            answers.shift()!(bindings);
            await new Promise((resolve) => setImmediate(resolve));
        },
    };
}

/** A version of the document, whose earlier checks the first version forgets. */
function version(uri: string, version: number, text: string) {
    if (version === 1) {
        clearStaticTypecheckCache(uri);
    }
    return TextDocument.create(uri, "jsoniq", version, text);
}

describe("variable types", () => {
    it("asks for a static typecheck without waiting, then types from it", async () => {
        const { wrapper, sendRequest, answer } = deferredWrapper();
        const source = version("file:///variable-types-latest.jq", 1, "let $a := 1 return $a");

        expect(getLatestVariableTypes(source, wrapper)).toBeUndefined();
        await answer([A_BINDING]);

        expect(getLatestVariableTypes(source, wrapper)?.typeOf(A_NAME)).toBe(INTEGER);
        expect(sendRequest).toHaveBeenCalledOnce();
    });

    it("keeps one check in flight while the document changes", async () => {
        const uri = "file:///variable-types-in-flight.jq";
        const { wrapper, sendRequest, answer } = deferredWrapper();

        getLatestVariableTypes(version(uri, 1, "let $a := 1 return $a"), wrapper);
        getLatestVariableTypes(version(uri, 2, "let $a := 1 return $a +"), wrapper);
        getLatestVariableTypes(version(uri, 3, "let $a := 1 return $a + "), wrapper);
        expect(sendRequest).toHaveBeenCalledOnce();

        await answer([A_BINDING]);
        // The answer is for version 1, so version 3 is checked next, while version 1 still types `$a`.
        const types = getLatestVariableTypes(version(uri, 3, "let $a := 1 return $a + "), wrapper);
        expect(types?.typeOf(A_NAME)).toBe(INTEGER);
        expect(sendRequest).toHaveBeenCalledTimes(2);
    });

    it("types a variable only where a binding of that name still ends", async () => {
        const uri = "file:///variable-types-edited.jq";
        const { wrapper, answer } = deferredWrapper();
        getLatestVariableTypes(version(uri, 1, "let $a := 1 return $a"), wrapper);
        await answer([A_BINDING]);

        const renamed = version(uri, 2, "let $b := 1 return $b");
        expect(getLatestVariableTypes(renamed, wrapper)?.typeOf(A_NAME)).toBeUndefined();
        const shifted = version(uri, 3, "let  $a := 1 return $a");
        const shiftedName = { start: { line: 0, character: 6 }, end: { line: 0, character: 7 } };
        expect(getLatestVariableTypes(shifted, wrapper)?.typeOf(shiftedName)).toBeUndefined();
    });
});

describe("variable completion with RumbleDB", () => {
    it.each([
        ["a valid query", "$count + 1"],
        ["an unfinished query", "$"],
    ])(
        "labels the variables of %s with their inferred types",
        async (_description, end) => {
            const text = `declare variable $count := 1;\nlet $name := "a"\nreturn ${end}`;
            const uri = `file:///variable-types-completion-${encodeURIComponent(end)}.jq`;
            const source = version(uri, 1, text);
            const cursor = source.positionAt(text.lastIndexOf("return") + "return $".length);
            const complete = async () =>
                findCompletions(source, cursor, parserService, workspaceService, wrapperClient);
            const description = (items: Awaited<ReturnType<typeof complete>>, label: string) =>
                items.find((item) => item.label === label)?.labelDetails?.description;

            // The first completion does not wait for RumbleDB.
            expect(description(await complete(), "$count")).toBe("Variable");

            await vi.waitFor(
                async () => {
                    const items = await complete();
                    expect(description(items, "$count")).toBe("xs:integer");
                    expect(description(items, "$name")).toBe("xs:string");
                },
                { timeout: 30_000, interval: 100 },
            );
        },
        60_000,
    );
});
