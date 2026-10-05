import assert from "node:assert/strict";
import { test } from "node:test";

import { highlightSource } from "../src/utils/syntax-highlight.ts";

test("XML tags, attributes, strings, comments, and entities have distinct colors", async () => {
    const tokens = await highlightSource('<book id="42">&amp;<!-- note --></book>', "xml");
    const colorOf = (content) => tokens.find((token) => token.content.includes(content))?.color;
    assert.match(colorOf("book"), /debugTokenExpression-name/);
    assert.match(colorOf("id"), /debugTokenExpression-number/);
    assert.match(colorOf("42"), /debugTokenExpression-string/);
    assert.match(colorOf("note"), /descriptionForeground/);
    assert.match(colorOf("&amp;"), /debugTokenExpression-boolean/);
});

test("XML highlighting preserves exact source, including line endings and unsafe markup", async () => {
    const samples = [
        "",
        "plain text",
        '<book a="x > y">😀 &lt; text</book>',
        '<?xml version="1.0"?>\r\n<book>\r\n\r\n  <item/>\r\n</book>\r\n',
        "<!-- a\n b -->\n<![CDATA[<raw> & text]]>\n",
        "<a/>\r<b/>\r",
        '<script>alert("hello")</script><img onerror="alert(1)"/>',
        '<unfinished attribute="',
    ];
    for (const source of samples) {
        const tokens = await highlightSource(source, "xml");
        assert.equal(tokens.map((token) => token.content).join(""), source);
    }
});

test("large XML falls back to exact plain text", async () => {
    const source = `<book>${"x".repeat(100_000)}</book>`;
    assert.deepEqual(await highlightSource(source, "xml"), [{ content: source }]);
});

test("function signatures use the existing query grammar", async () => {
    const source = "function(xs:string, xs:integer) as xs:boolean";
    const tokens = await highlightSource(source);
    assert.equal(tokens.map((token) => token.content).join(""), source);
    assert.ok(new Set(tokens.map((token) => token.color)).size > 1);
});

test("small previews reuse cached tokens", async () => {
    const source = '"<book/>"';
    const tokens = await highlightSource(source);
    assert.equal(await highlightSource(source), tokens);
});

test("shared query grammar distinguishes literals from XML markup", async () => {
    const string = await highlightSource('"<book/>"');
    assert.ok(string.every((token) => /debugTokenExpression-string/.test(token.color)));
    const number = await highlightSource("9007199254740993");
    assert.match(number[0].color, /debugTokenExpression-number/);
    for (const source of ["true()", "false()", "null", 'xs:float("INF")']) {
        const tokens = await highlightSource(source);
        assert.equal(tokens.map((token) => token.content).join(""), source);
        assert.ok(tokens.some((token) => token.color));
    }
});

test("typed constructors distinguish names, arguments, and punctuation", async () => {
    for (const source of [
        'xs:date("2026-10-05")',
        'xs:duration("P1DT2H")',
        'xs:base64Binary("SGVsbG8=")',
    ]) {
        const tokens = await highlightSource(source);
        const name = tokens.find((token) => token.content.startsWith("xs:"));
        const argument = tokens.find((token) => token.content.includes('"'));
        assert.match(name.color, /debugTokenExpression-name/);
        assert.match(argument.color, /debugTokenExpression-string/);
        assert.equal(tokens.map((token) => token.content).join(""), source);
    }
});

test("XML body text stays plain even when it contains query keywords or types", async () => {
    const source = "<book>long return xs:date 42</book>";
    const tokens = await highlightSource(source, "xml");
    assert.equal(tokens.map((token) => token.content).join(""), source);
    const body = tokens.find((token) => token.content.includes("long return"));
    assert.equal(body.color, "var(--vscode-editor-foreground)");
    assert.notEqual(await highlightSource(source), tokens);
    assert.equal(await highlightSource(source, "xml"), tokens);
});
