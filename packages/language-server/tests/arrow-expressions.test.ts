import type { FunctionCallNode } from "server/analysis/index.js";
import { walkAst } from "server/analysis/queries.js";
import { findDefinitionLocation } from "server/lsp/features/definition.js";
import { findHover } from "server/lsp/features/hover.js";
import { collectInlayHints } from "server/lsp/features/inlay-hints.js";
import { findReferenceLocations } from "server/lsp/features/references.js";
import { buildRenameWorkspaceEdit } from "server/lsp/features/rename.js";
import { collectSemanticTokens } from "server/lsp/features/semantic-tokens.js";
import { findSignatureHelp } from "server/lsp/features/signature-help.js";
import { describe, expect, it } from "vitest";
import type { CompletionItem, MarkupContent } from "vscode-languageserver";
import type { TextDocument } from "vscode-languageserver-textdocument";

import { parserService, workspaceService } from "./services.js";
import {
    createMockWrapperClient,
    findCompletions,
    positionAt,
    positionAtNth,
    testDocumentFromUri,
} from "./test-utils.js";

const fullRange = {
    start: { line: 0, character: 0 },
    end: { line: 100, character: 0 },
};

/** The position just after the first occurrence of `needle`. */
function positionAfter(document: TextDocument, needle: string) {
    const position = positionAt(document, needle);
    return { line: position.line, character: position.character + needle.length };
}

describe.each(["jsoniq", "xquery"])("%s arrow expressions", (languageId) => {
    let documents = 0;
    const open = (source: string): TextDocument =>
        testDocumentFromUri(source, {
            uri: `file:///arrow-${documents++}.${languageId === "jsoniq" ? "jq" : "xq"}`,
            languageId,
        });

    const declareF = "declare function local:f($a, $b) { $a };\n";

    async function calls(document: TextDocument): Promise<FunctionCallNode[]> {
        const analysis = await workspaceService.getAnalysis(document);
        return [...walkAst(analysis.ast)].filter(
            (node): node is FunctionCallNode => node.kind === "function-call",
        );
    }

    async function diagnostics(document: TextDocument): Promise<string[]> {
        return (await workspaceService.getAnalysis(document)).diagnostics.map(
            (diagnostic) => diagnostic.message,
        );
    }

    it("passes the operand as the first argument, so the function has one more parameter", async () => {
        const document = open(`${declareF}"x" => local:f(2)`);

        const [call] = await calls(document);
        expect(call?.name.arity).toBe(2);
        expect(call?.reference.resolution?.declaration.kind).toBe("function");
        expect(call?.arguments.map((argument) => [argument.index, argument.piped])).toEqual([
            [0, true],
            [1, undefined],
        ]);
        expect(document.getText(call?.arguments[0]?.range)).toBe('"x"');
        expect(await diagnostics(document)).toEqual([]);
    });

    it("keeps the children of an arrow call in source order", async () => {
        const document = open(`${declareF}"x" => local:f(2)`);

        const [call] = await calls(document);
        expect(call?.children.map((child) => document.getText(child.range))).toEqual([
            '"x"',
            "local:f",
            "2",
        ]);
    });

    it("highlights the function names of an arrow chain", async () => {
        const document = open("declare variable $v := 1;\n$v => concat($v) => count()");

        const { data } = await collectSemanticTokens(document, workspaceService);
        // [line delta, start delta, length] of each token after the declaration.
        const tokens = Array.from({ length: data.length / 5 }, (_, token) =>
            data.slice(token * 5, token * 5 + 3),
        ).slice(1);
        expect(tokens).toEqual([
            [1, 0, 2], // $v
            [0, 6, 6], // concat
            [0, 7, 2], // $v
            [0, 7, 5], // count
        ]);
    });

    it("counts an argument placeholder in the arity", async () => {
        const document = open(`${declareF}"x" => local:f(?)`);

        expect((await calls(document))[0]?.name.arity).toBe(2);
        expect(await diagnostics(document)).toEqual([]);
    });

    it("reports an arrow to an undefined function", async () => {
        expect(await diagnostics(open("1 => local:nope()"))).toEqual([
            "Reference to undefined function 'Q{http://www.w3.org/2005/xquery-local-functions}nope#1'",
        ]);
    });

    it("reports an arrow whose arguments do not fit the arity", async () => {
        expect(await diagnostics(open(`${declareF}1 => local:f(2, 3)`))).toEqual([
            "Reference to undefined function 'Q{http://www.w3.org/2005/xquery-local-functions}f#3'",
        ]);
    });

    it("nests the steps of a chain from the left", async () => {
        const document = open('"a,b" => tokenize(",") => count()');

        const [outer, inner] = await calls(document);
        expect(document.getText(outer?.selectionRange)).toBe("count");
        expect(outer?.name.arity).toBe(1);
        expect(inner?.name.arity).toBe(2);
        expect(outer?.arguments[0]?.children).toContain(inner);
        expect(document.getText(outer?.range)).toBe(document.getText());
        expect(await diagnostics(document)).toEqual([]);
    });

    it("leaves a dynamic step as an expression", async () => {
        const document = open("declare variable $f := concat#2;\n1 => $f(2)");

        // Only `concat#2` names a function; `$f` stays a variable reference.
        expect((await calls(document)).map((call) => call.name.arity)).toEqual([2]);
        expect(await diagnostics(document)).toEqual([]);
    });

    it("goes to the definition of the function an arrow names", async () => {
        const document = open(`${declareF}"x" => local:f(2)`);

        const location = await findDefinitionLocation(
            document,
            positionAtNth(document, "local:f", 1),
            workspaceService,
        );
        expect(location?.range.start).toEqual(positionAt(document, "local:f"));
    });

    it("finds and renames the function where an arrow names it", async () => {
        const document = open(`${declareF}local:f(1, 2), "x" => local:f(2)`);
        const position = positionAt(document, "local:f");

        const references = await findReferenceLocations(
            document,
            position,
            false,
            workspaceService,
        );
        expect(references.map((location) => location.range.start)).toEqual([
            positionAtNth(document, "local:f", 1),
            positionAtNth(document, "local:f", 2),
        ]);

        const edit = await buildRenameWorkspaceEdit(
            document,
            position,
            "local:g",
            workspaceService,
        );
        expect(edit?.changes?.[document.uri]).toHaveLength(3);
    });

    it("starts signature help at the parameter after the operand", async () => {
        const document = open('"abc" => substring()');

        const help = await findSignatureHelp(
            document,
            positionAfter(document, "substring("),
            workspaceService,
        );
        expect(help?.activeParameter).toBe(1);
        expect(help?.signatures[help.activeSignature!]?.label).toContain("substring");
    });

    it("counts written arguments after the operand in signature help", async () => {
        const document = open('"abc" => substring(2, 3)');

        const help = await findSignatureHelp(document, positionAt(document, "3"), workspaceService);
        expect(help?.activeParameter).toBe(2);
        expect(help?.signatures[help.activeSignature!]?.parameters).toHaveLength(3);
    });

    it("gives signature help for the enclosing call inside the operand", async () => {
        const document = open('concat("abc" => upper-case(), "d")');

        const help = await findSignatureHelp(
            document,
            positionAt(document, "abc"),
            workspaceService,
        );
        expect(help?.signatures[help.activeSignature!]?.label).toContain("concat");
        expect(help?.activeParameter).toBe(0);
    });

    it("gives no signature help inside an operand outside any call", async () => {
        const document = open('"abc" => upper-case()');

        expect(
            await findSignatureHelp(document, positionAt(document, "abc"), workspaceService),
        ).toBeNull();
    });

    it("names only the written arguments in inlay hints", async () => {
        const document = open(`${declareF}"x" => local:f(2), "a,b" => tokenize(",") => count()`);

        const hints = await collectInlayHints(document, fullRange, workspaceService);
        expect(hints.map((hint) => [hint.label, hint.position])).toEqual([
            ["$b: ", positionAt(document, "2)")],
            ["$pattern: ", positionAtNth(document, '","', 0)],
        ]);
    });

    it("says on hover which parameter the operand fills", async () => {
        const document = open('"abc" => substring(2)');

        const hover = await findHover(
            document,
            positionAt(document, "substring"),
            workspaceService,
        );
        const contents = hover?.contents as MarkupContent | undefined;
        expect(contents?.value).toMatch(
            /^The first parameter, `\$sourceString`, is filled by the expression before `=>`\.\n\n```/,
        );
    });

    it("writes the signature as an arrow step in signature help", async () => {
        const document = open('"abc" => substring(2)');

        const help = await findSignatureHelp(document, positionAt(document, "2"), workspaceService);
        const signature = help?.signatures[help.activeSignature!];
        expect(signature?.label).toBe(
            "$sourceString as xs:string? => substring($start as xs:double) as xs:string",
        );
        // Each parameter is its offsets in the label, so the active one still highlights.
        const parameterText = signature?.parameters?.map(({ label }) =>
            typeof label === "string" ? label : signature.label.slice(...label),
        );
        expect(parameterText).toEqual(["$sourceString as xs:string?", "$start as xs:double"]);
    });

    it("writes a source function's signature as an arrow step", async () => {
        const document = open(`${declareF}"x" => local:f(2)`);

        const help = await findSignatureHelp(
            document,
            positionAt(document, "2)"),
            workspaceService,
        );
        expect(help?.signatures[0]?.label).toBe("$a => local:f($b)");
        expect(help?.activeParameter).toBe(1);
    });

    it("keeps the call form for a call without an arrow", async () => {
        const document = open('substring("abc", 2)');

        const help = await findSignatureHelp(document, positionAt(document, "2"), workspaceService);
        expect(help?.signatures[help.activeSignature!]?.label).toMatch(/^substring\(/);
    });

    it("leaves calls without an arrow free of the operand note", async () => {
        const document = open('substring("abc", 2)');

        const hover = await findHover(
            document,
            positionAt(document, "substring"),
            workspaceService,
        );
        expect(JSON.stringify(hover?.contents)).not.toContain("before `=>`");
    });

    /** The completions where the source ends, by label. */
    async function completionsAtEnd(source: string): Promise<Map<string, CompletionItem>> {
        const document = open(source);
        const items = await findCompletions(
            document,
            document.positionAt(source.length),
            parserService,
            workspaceService,
            createMockWrapperClient(),
        );
        return new Map(items.map((item) => [String(item.label), item]));
    }

    /** The call each function completion inserts where the source ends, by label. */
    async function insertedCalls(source: string): Promise<Map<string, string | undefined>> {
        const items = await completionsAtEnd(source);
        return new Map([...items].map(([label, item]) => [label, item.insertText]));
    }

    it("leaves the parameter the operand fills out of an arrow's call", async () => {
        const calls = await insertedCalls('"abc" => ');

        expect(calls.get("fn:substring")).toBe("fn:substring(${1:\\$start})$0");
        expect(calls.get("fn:upper-case")).toBe("fn:upper-case()$0");
        expect(calls.get("fn:concat")).toBe("fn:concat(${1:\\$arg2})$0");
    });

    it("uses the overload with a parameter after an arrow", async () => {
        // `fn:string` has overloads with no parameter and with one. Both insert `fn:string()`,
        // but only the second fits after an arrow, and the item shows its signature.
        const arrowItem = (await completionsAtEnd("1 => ")).get("fn:string");
        const callItem = (await completionsAtEnd("")).get("fn:string");
        expect(arrowItem?.insertText).toBe("fn:string()$0");
        expect(arrowItem?.labelDetails?.detail).toMatch(/^\(\S/);
        expect(callItem?.labelDetails?.detail).toMatch(/^\(\)/);
    });

    it("offers no function without parameters after an arrow", async () => {
        const calls = await insertedCalls("1 => ");

        expect(calls.has("fn:current-date")).toBe(false);
        expect((await insertedCalls("")).has("fn:current-date")).toBe(true);
    });

    it("inserts a declared function after an arrow with its other parameters", async () => {
        const calls = await insertedCalls(
            `declare function local:none() { 1 };\n${declareF}1 => local:`,
        );

        expect(calls.get("local:f")).toBe("local:f(${1:\\$b})$0");
        expect(calls.has("local:none")).toBe(false);
    });

    it("inserts every parameter for a call without an arrow", async () => {
        const calls = await insertedCalls(`${declareF}`);

        expect(calls.get("local:f")).toBe("local:f(${1:\\$a}, ${2:\\$b})$0");
        expect(calls.get("fn:concat")).toBe("fn:concat(${1:\\$arg1}, ${2:\\$arg2})$0");
    });
});
