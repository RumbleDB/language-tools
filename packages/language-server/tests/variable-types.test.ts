import type { SequenceType } from "server/analysis/index.js";
import { clearStaticTypecheckCache } from "server/integrations/rumble/operations/static-typecheck/service.js";
import type { VariableBinding } from "server/integrations/rumble/operations/static-typecheck/types.js";
import { getVariableTypes } from "server/integrations/rumble/operations/static-typecheck/variable-types.js";
import { findCompletionList } from "server/lsp/features/completion.js";
import { describe, expect, it, vi } from "vitest";
import { CancellationTokenSource, type Range } from "vscode-languageserver";
import { TextDocument } from "vscode-languageserver-textdocument";

import { parserService, workspaceService, wrapperClient } from "./services.js";
import { createMockWrapperClient, findCompletions } from "./test-utils.js";

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

/** Short enough for the tests that wait it out. */
const WAIT_MS = 20;

/** A wrapper whose static typechecks are answered, in order, when the test says so. */
function deferredWrapper() {
    const answers: Array<(bindings: VariableBinding[] | Error) => void> = [];
    const sendRequest = vi.fn().mockImplementation(
        () =>
            new Promise((resolve, reject) => {
                answers.push((bindings) =>
                    bindings instanceof Error
                        ? reject(bindings)
                        : resolve({
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
        /** Answers the next check once it is asked for, with bindings, or by failing. */
        answer: async (bindings: VariableBinding[] | Error) => {
            await vi.waitFor(() => expect(answers).not.toHaveLength(0));
            answers.shift()!(bindings);
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
    it("waits for RumbleDB to type the current version", async () => {
        const { wrapper, sendRequest, answer } = deferredWrapper();
        const source = version("file:///variable-types-wait.jq", 1, "let $a := 1 return $a");

        const types = getVariableTypes(source, wrapper, { waitMs: 1000 });
        await answer([A_BINDING]);

        expect((await types).typeOf(A_NAME)).toBe(INTEGER);
        expect((await types).isUpdating).toBe(false);
        expect(sendRequest).toHaveBeenCalledOnce();
    });

    it("gives up waiting after the wait, and types from what it knows then", async () => {
        const { wrapper, answer } = deferredWrapper();
        const uri = "file:///variable-types-given-up.jq";
        void getVariableTypes(version(uri, 1, "let $a := 1 return $a"), wrapper, {
            waitMs: 1000,
        });
        await answer([A_BINDING]);

        const edited = version(uri, 2, "let $a := 1 return $a + ");
        const types = await getVariableTypes(edited, wrapper, { waitMs: WAIT_MS });

        expect(types.typeOf(A_NAME)).toBe(INTEGER);
        expect(types.isUpdating).toBe(true);
    });

    it("gives up waiting when the request is cancelled", async () => {
        const { wrapper } = deferredWrapper();
        const source = version("file:///variable-types-cancelled.jq", 1, "let $a := 1 return $a");
        const cancellation = new CancellationTokenSource();

        const types = getVariableTypes(source, wrapper, {
            waitMs: 60_000,
            token: cancellation.token,
        });
        cancellation.cancel();

        expect((await types).isUpdating).toBe(true);
    });

    it("keeps waiting for the current version when an earlier one is answered", async () => {
        const uri = "file:///variable-types-earlier.jq";
        const { wrapper, sendRequest, answer } = deferredWrapper();
        void getVariableTypes(version(uri, 1, "let $a := 1 return $a"), wrapper, { waitMs: 0 });

        const current = version(uri, 2, "let $a := 1 return $a + 1");
        const types = getVariableTypes(current, wrapper, { waitMs: 1000 });
        await answer([]);
        await answer([A_BINDING]);

        expect((await types).typeOf(A_NAME)).toBe(INTEGER);
        expect((await types).isUpdating).toBe(false);
        expect(sendRequest).toHaveBeenCalledTimes(2);
    });

    it("stops waiting when the check fails", async () => {
        const { wrapper, sendRequest, answer } = deferredWrapper();
        const source = version("file:///variable-types-failed.jq", 1, "let $a := 1 return $a");

        const types = getVariableTypes(source, wrapper, { waitMs: 1000 });
        await answer(new Error("RumbleDB failed"));

        expect((await types).typeOf(A_NAME)).toBeUndefined();
        expect((await types).isUpdating).toBe(false);
        expect(sendRequest).toHaveBeenCalledOnce();
    });

    it("types a variable only where a binding of that name still ends", async () => {
        const uri = "file:///variable-types-edited.jq";
        const { wrapper, answer } = deferredWrapper();
        void getVariableTypes(version(uri, 1, "let $a := 1 return $a"), wrapper, {
            waitMs: 1000,
        });
        await answer([A_BINDING]);

        const renamed = version(uri, 2, "let $b := 1 return $b");
        const renamedTypes = await getVariableTypes(renamed, wrapper, { waitMs: 0 });
        expect(renamedTypes.typeOf(A_NAME)).toBeUndefined();
        const shifted = version(uri, 3, "let  $a := 1 return $a");
        const shiftedName = { start: { line: 0, character: 6 }, end: { line: 0, character: 7 } };
        const shiftedTypes = await getVariableTypes(shifted, wrapper, { waitMs: 0 });
        expect(shiftedTypes.typeOf(shiftedName)).toBeUndefined();
    });
});

describe("variable completion while RumbleDB checks the document", () => {
    const text = "let $a := 1 return $";
    const complete = (source: TextDocument, wrapper: ReturnType<typeof createMockWrapperClient>) =>
        findCompletionList(
            source,
            source.positionAt(text.length),
            parserService,
            workspaceService,
            wrapper,
        );
    const labelOfA = (list: Awaited<ReturnType<typeof complete>>) =>
        list.items.find((item) => item.label === "$a")?.labelDetails?.description;

    it("labels variables with the types that RumbleDB infers while it waits", async () => {
        const { wrapper, answer } = deferredWrapper();
        const source = version("file:///variable-types-completion-wait.jq", 1, text);

        const list = complete(source, wrapper);
        await answer([A_BINDING]);

        expect((await list).isIncomplete).toBe(false);
        expect(labelOfA(await list)).toBe("xs:integer");
    });

    it("is incomplete when RumbleDB takes too long, so that the editor asks again", async () => {
        const { wrapper, answer } = deferredWrapper();
        const source = version("file:///variable-types-completion-slow.jq", 1, text);

        const slow = await complete(source, wrapper);
        expect(slow.isIncomplete).toBe(true);
        expect(labelOfA(slow)).toBe("Variable");

        await answer([A_BINDING]);
        const asked = await complete(source, wrapper);
        expect(asked.isIncomplete).toBe(false);
        expect(labelOfA(asked)).toBe("xs:integer");
    });

    it("is complete when RumbleDB is unavailable", async () => {
        const wrapper = createMockWrapperClient({ isUsable: () => false });
        const source = version("file:///variable-types-unavailable.jq", 1, text);

        const list = await complete(source, wrapper);
        expect(list.isIncomplete).toBe(false);
        expect(labelOfA(list)).toBe("Variable");
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

            // RumbleDB may still be starting, and then the editor asks again as the user types.
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
