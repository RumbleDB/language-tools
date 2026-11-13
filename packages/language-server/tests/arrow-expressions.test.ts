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
import type { InlayHint, InlayHintLabelPart } from "vscode-languageserver";
import type { TextDocument } from "vscode-languageserver-textdocument";

import { workspaceService } from "./services.js";
import { positionAt, positionAtNth, testDocumentFromUri } from "./test-utils.js";

const fullRange = {
    start: { line: 0, character: 0 },
    end: { line: 100, character: 0 },
};

/** The text of a hint, whether it is a string or made of parts. */
function hintText(hint: InlayHint): string {
    return typeof hint.label === "string"
        ? hint.label
        : hint.label.map((part) => part.value).join("");
}

/** The parts of a hint's label, or none when the label is plain text. */
function labelParts(hint: InlayHint | undefined): InlayHintLabelPart[] {
    return Array.isArray(hint?.label) ? hint.label : [];
}

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

    it("highlights an arrow chain in source order", async () => {
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

    it("describes the function an arrow names on hover", async () => {
        const document = open('"abc" => substring(2)');

        const hover = await findHover(
            document,
            positionAt(document, "substring"),
            workspaceService,
        );
        expect(JSON.stringify(hover?.contents)).toContain("substring");
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

    it("names the parameter the operand fills before the function name in inlay hints", async () => {
        const document = open(`${declareF}"x" => local:f(2)`);

        const hints = await collectInlayHints(document, fullRange, workspaceService);
        expect(hints.map((hint) => [hintText(hint), hint.position])).toEqual([
            ["$a: ", positionAtNth(document, "local:f", 1)],
            ["$b: ", positionAt(document, "2)")],
        ]);
    });

    it("quotes the operand and links the parameter in the operand hint", async () => {
        const document = open(`${declareF}"x" => local:f(2)`);

        const [hint] = await collectInlayHints(document, fullRange, workspaceService);
        const [part] = labelParts(hint);
        expect(part?.tooltip).toEqual({
            kind: "markdown",
            value: 'Filled by the expression before `=>`:\n\n```jsoniq\n"x"\n```',
        });
        expect(part?.location).toEqual({
            uri: document.uri,
            range: {
                start: positionAt(document, "$a"),
                end: positionAfter(document, "$a"),
            },
        });
    });

    it("gives each step of a chain its own operand hint", async () => {
        const document = open('"a,b" => tokenize(",") => count()');

        const hints = await collectInlayHints(document, fullRange, workspaceService);
        const operandHints = hints.filter((hint) => Array.isArray(hint.label));
        expect(operandHints.map((hint) => [hintText(hint), hint.position])).toEqual([
            ["$arg: ", positionAt(document, "count")],
            ["$input: ", positionAt(document, "tokenize")],
        ]);
        // The outer step quotes the whole inner step as its operand.
        expect(JSON.stringify(labelParts(operandHints[0])[0]?.tooltip)).toContain(
            '\\"a,b\\" => tokenize(\\",\\")',
        );
    });

    it("says on hover which parameter the operand fills", async () => {
        const document = open('"abc" => substring(2)');

        const hover = await findHover(
            document,
            positionAt(document, "substring"),
            workspaceService,
        );
        expect(JSON.stringify(hover?.contents)).toContain(
            "The first parameter, `$sourceString`, is filled by the expression before `=>`.",
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
});
