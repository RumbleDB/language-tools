import { buildAnalysis } from "server/analysis/builder.js";
import { isSourceDefinition } from "server/analysis/model.js";
import { findSymbolAtPosition, getVisibleDeclarationsAtPosition } from "server/analysis/queries.js";
import { describe, expect, it } from "vitest";

import { testDocument } from "./test-utils.js";

describe("JSONiq variable scope analysis", () => {
    it("collects variable declarations from function params and FLWOR clauses", async () => {
        const document = testDocument("scope-declarations", [
            "declare function local:f($a, $b as integer) {",
            "  for $x at $pos in (1, 2, 3)",
            "  let $y := $x + $a",
            "  group by $g := $y mod 2",
            "  count $c",
            "  return $g + $c + $b",
            "};",
        ]);

        const analysis = await buildAnalysis(document);
        const declarationNames = analysis.definitions.map((declaration) => declaration.name);

        expect(declarationNames).toMatchObject([
            {
                arity: 2,
                qname: {
                    localName: "f",
                    prefix: "local",
                },
            },
            {
                qname: {
                    localName: "a",
                },
            },
            {
                qname: {
                    localName: "b",
                },
            },
            {
                qname: { localName: "x" },
            },
            {
                qname: {
                    localName: "pos",
                },
            },
            {
                qname: { localName: "y" },
            },
            {
                qname: { localName: "g" },
            },
            {
                qname: { localName: "c" },
            },
        ]);
    });

    it("resolves references to the nearest declaration", async () => {
        const document = testDocument("scope-resolution", [
            "declare variable $x := 10;",
            "declare function local:f($x) {",
            "  let $y := $x + 1",
            "  return $y + $x",
            "};",
            "local:f($x)",
        ]);

        const analysis = await buildAnalysis(document);
        const references = analysis.references
            .filter((reference) => reference.kind === "variable")
            .map((reference) => ({
                name: reference.name,
                line: reference.range.start.line,
                resolvedTo: reference.declaration?.name,
                resolvedKind: reference.declaration?.kind,
            }));

        expect(references).toEqual([
            {
                name: {
                    qname: { localName: "x" },
                },
                line: 2,
                resolvedTo: {
                    qname: { localName: "x" },
                },
                resolvedKind: "parameter",
            },
            {
                name: {
                    qname: { localName: "y" },
                },
                line: 3,
                resolvedTo: {
                    qname: { localName: "y" },
                },
                resolvedKind: "let",
            },
            {
                name: {
                    qname: { localName: "x" },
                },
                line: 3,
                resolvedTo: {
                    qname: { localName: "x" },
                },
                resolvedKind: "parameter",
            },
            {
                name: {
                    qname: { localName: "x" },
                },
                line: 5,
                resolvedTo: {
                    qname: { localName: "x" },
                },
                resolvedKind: "declare-variable",
            },
        ]);
    });

    it("resolves function call references by name and arity", async () => {
        const document = testDocument("scope-function-references", [
            "declare function local:add($left, $right) {",
            "  $left + $right",
            "};",
            "local:add(1, 2)",
        ]);

        const analysis = await buildAnalysis(document);
        const functionReference = analysis.references.find(
            (reference) =>
                reference.kind === "function" && reference.name.qname.localName === "add",
        );

        expect(functionReference).toMatchObject({
            name: {
                arity: 2,
                qname: {
                    localName: "add",
                    prefix: "local",
                },
            },
            range: {
                start: { line: 3, character: 0 },
                end: { line: 3, character: "local:add".length },
            },
            declaration: {
                name: {
                    arity: 2,
                    qname: {
                        localName: "add",
                        prefix: "local",
                    },
                },
                kind: "function",
            },
        });
    });

    it("resolves function references by full qname", async () => {
        const document = testDocument("scope-function-qname-resolution", [
            'declare namespace local = "http://example.com/local";',
            'declare namespace other = "http://example.com/other";',
            "declare function local:add($left, $right) {",
            "  $left + $right",
            "};",
            "declare function other:add($left, $right) {",
            "  $left - $right",
            "};",
            "other:add(1, 2)",
        ]);

        const analysis = await buildAnalysis(document);
        const functionReference = analysis.references.find(
            (reference) =>
                reference.kind === "function" &&
                reference.name.qname.prefix === "other" &&
                reference.name.qname.localName === "add",
        );

        expect(functionReference).toMatchObject({
            name: {
                arity: 2,
                qname: {
                    prefix: "other",
                    localName: "add",
                    namespaceUri: "http://example.com/other",
                },
            },
            declaration: {
                kind: "function",
                name: {
                    arity: 2,
                    qname: {
                        prefix: "other",
                        localName: "add",
                        namespaceUri: "http://example.com/other",
                    },
                },
            },
        });
    });

    it("resolves function references by namespace uri, not just prefix", async () => {
        const document = testDocument("scope-function-namespace-alias-resolution", [
            'declare namespace a = "http://example.com/shared";',
            'declare namespace b = "http://example.com/shared";',
            "declare function a:add($left, $right) {",
            "  $left + $right",
            "};",
            "b:add(1, 2)",
        ]);

        const analysis = await buildAnalysis(document);
        const functionReference = analysis.references.find(
            (reference) =>
                reference.kind === "function" &&
                reference.name.qname.prefix === "b" &&
                reference.name.qname.localName === "add",
        );

        expect(functionReference).toMatchObject({
            name: {
                arity: 2,
                qname: {
                    prefix: "b",
                    localName: "add",
                    namespaceUri: "http://example.com/shared",
                },
            },
            declaration: {
                kind: "function",
                name: {
                    arity: 2,
                    qname: {
                        prefix: "a",
                        localName: "add",
                        namespaceUri: "http://example.com/shared",
                    },
                },
            },
        });
    });

    it("supports multiple for variables in the same clause", async () => {
        const document = testDocument("scope-multi-for", [
            "for $x in (1, 2, 3), $y in ($x, 4)",
            "return 10 * $x + $y",
        ]);

        const analysis = await buildAnalysis(document);

        expect(analysis.definitions.map((declaration) => declaration.name)).toEqual([
            { qname: { localName: "x" } },
            { qname: { localName: "y" } },
        ]);
        expect(
            analysis.references.map((reference) => ({
                name: reference.name,
                line: reference.range.start.line,
                resolvedTo: reference.declaration?.name,
            })),
        ).toEqual([
            {
                name: { qname: { localName: "x" } },
                line: 0,
                resolvedTo: { qname: { localName: "x" } },
            },
            {
                name: { qname: { localName: "x" } },
                line: 1,
                resolvedTo: { qname: { localName: "x" } },
            },
            {
                name: { qname: { localName: "y" } },
                line: 1,
                resolvedTo: { qname: { localName: "y" } },
            },
        ]);
    });

    it("resolves variables by full qname", async () => {
        const document = testDocument("scope-variable-qname-resolution", [
            'declare namespace local = "http://example.com/local";',
            'declare namespace other = "http://example.com/other";',
            "declare variable $local:value := 1;",
            "declare variable $other:value := 2;",
            "$other:value + $local:value",
        ]);

        const analysis = await buildAnalysis(document);
        const variableReferences = analysis.references
            .filter((reference) => reference.kind === "variable")
            .map((reference) => ({
                name: reference.name,
                resolvedTo: reference.declaration.name,
                resolvedKind: reference.declaration.kind,
            }));

        expect(variableReferences).toEqual([
            {
                name: {
                    qname: {
                        prefix: "other",
                        localName: "value",
                        namespaceUri: "http://example.com/other",
                    },
                },
                resolvedTo: {
                    qname: {
                        prefix: "other",
                        localName: "value",
                        namespaceUri: "http://example.com/other",
                    },
                },
                resolvedKind: "declare-variable",
            },
            {
                name: {
                    qname: {
                        prefix: "local",
                        localName: "value",
                        namespaceUri: "http://example.com/local",
                    },
                },
                resolvedTo: {
                    qname: {
                        prefix: "local",
                        localName: "value",
                        namespaceUri: "http://example.com/local",
                    },
                },
                resolvedKind: "declare-variable",
            },
        ]);
    });

    it("resolves variables by namespace uri, not just prefix", async () => {
        const document = testDocument("scope-variable-namespace-alias-resolution", [
            'declare namespace a = "http://example.com/shared";',
            'declare namespace b = "http://example.com/shared";',
            "declare variable $a:value := 1;",
            "$b:value",
        ]);

        const analysis = await buildAnalysis(document);

        expect(
            analysis.references
                .filter((reference) => reference.kind === "variable")
                .map((reference) => ({
                    name: reference.name,
                    resolvedTo: reference.declaration.name,
                    resolvedKind: reference.declaration.kind,
                })),
        ).toEqual([
            {
                name: {
                    qname: {
                        prefix: "b",
                        localName: "value",
                        namespaceUri: "http://example.com/shared",
                    },
                },
                resolvedTo: {
                    qname: {
                        prefix: "a",
                        localName: "value",
                        namespaceUri: "http://example.com/shared",
                    },
                },
                resolvedKind: "declare-variable",
            },
        ]);
    });

    it("provides implicit error variables inside catch expressions", async () => {
        const document = testDocument("scope-catch-expression-variables", [
            "try { 1 div 0 }",
            "catch * { $err:code, $err:description }",
        ]);

        const analysis = await buildAnalysis(document);

        expect(
            analysis.definitions
                .filter((definition) => definition.kind === "catch-variable")
                .map((definition) => definition.name),
        ).toMatchObject([
            { qname: { prefix: "err", localName: "code" } },
            { qname: { prefix: "err", localName: "description" } },
            { qname: { prefix: "err", localName: "value" } },
            { qname: { prefix: "err", localName: "module" } },
            { qname: { prefix: "err", localName: "line-number" } },
            { qname: { prefix: "err", localName: "column-number" } },
            { qname: { prefix: "err", localName: "additional" } },
        ]);

        expect(
            analysis.references
                .filter((reference) => reference.kind === "variable")
                .map((reference) => ({
                    name: reference.name,
                    resolvedTo: reference.declaration.name,
                    resolvedKind: reference.declaration.kind,
                })),
        ).toMatchObject([
            {
                name: { qname: { prefix: "err", localName: "code" } },
                resolvedTo: { qname: { prefix: "err", localName: "code" } },
                resolvedKind: "catch-variable",
            },
            {
                name: { qname: { prefix: "err", localName: "description" } },
                resolvedTo: { qname: { prefix: "err", localName: "description" } },
                resolvedKind: "catch-variable",
            },
        ]);
    });

    it("supports multiple for bindings that each define an at-position variable", async () => {
        const document = testDocument("scope-multi-for-at", [
            "for $x at $ix in (1, 2), $y at $iy in ($x, 3)",
            "return $x + $ix + $y + $iy",
        ]);

        const analysis = await buildAnalysis(document);

        expect(
            analysis.definitions.map((declaration) => ({
                name: declaration.name,
                kind: declaration.kind,
            })),
        ).toEqual([
            { name: { qname: { localName: "x" } }, kind: "for" },
            { name: { qname: { localName: "ix" } }, kind: "for-position" },
            { name: { qname: { localName: "y" } }, kind: "for" },
            { name: { qname: { localName: "iy" } }, kind: "for-position" },
        ]);

        expect(
            analysis.references.map((reference) => ({
                name: reference.name,
                line: reference.range.start.line,
                resolvedTo: reference.declaration?.name,
                resolvedKind: reference.declaration?.kind,
            })),
        ).toEqual([
            {
                name: { qname: { localName: "x" } },
                line: 0,
                resolvedTo: { qname: { localName: "x" } },
                resolvedKind: "for",
            },
            {
                name: { qname: { localName: "x" } },
                line: 1,
                resolvedTo: { qname: { localName: "x" } },
                resolvedKind: "for",
            },
            {
                name: { qname: { localName: "ix" } },
                line: 1,
                resolvedTo: { qname: { localName: "ix" } },
                resolvedKind: "for-position",
            },
            {
                name: { qname: { localName: "y" } },
                line: 1,
                resolvedTo: { qname: { localName: "y" } },
                resolvedKind: "for",
            },
            {
                name: { qname: { localName: "iy" } },
                line: 1,
                resolvedTo: { qname: { localName: "iy" } },
                resolvedKind: "for-position",
            },
        ]);
    });

    it("stores references per declaration and supports binary-search occurrence lookup", async () => {
        const document = testDocument("scope-index", [
            "declare function local:f($x) {",
            "  let $y := $x + 1",
            "  return $y + $x",
            "};",
        ]);

        const analysis = await buildAnalysis(document);
        const parameter = analysis.definitions.find(
            (declaration) =>
                declaration.kind === "parameter" && declaration.name.qname.localName === "x",
        );

        expect(parameter).toBeDefined();

        if (parameter === undefined) {
            return;
        }

        expect(parameter.references.map((reference) => reference.range.start.line)).toEqual([1, 2]);

        const occurrence = findSymbolAtPosition(analysis, { line: 2, character: 14 });

        expect(occurrence?.reference).toBeDefined();
        expect(occurrence?.declaration.name).toEqual({ qname: { localName: "x" } });
        expect(occurrence?.declaration.kind).toBe("parameter");
    });

    it("returns correct declaration for reference on the same line as declaration", async () => {
        const document = testDocument("scope-same-line", [
            "declare function local:f($x) {",
            "  let $y := $x + 1 return $y + $x",
            "};",
        ]);

        const analysis = await buildAnalysis(document);
        const parameter = analysis.definitions.find(
            (declaration) =>
                declaration.kind === "parameter" && declaration.name.qname.localName === "x",
        );

        expect(parameter).toBeDefined();

        if (parameter === undefined) {
            return;
        }

        expect(parameter.references.map((reference) => reference.range.start.line)).toEqual([1, 1]);

        const occurrence = findSymbolAtPosition(analysis, { line: 1, character: 13 });

        expect(occurrence?.reference).toBeDefined();
        expect(occurrence?.declaration.name).toEqual({ qname: { localName: "x" } });
        expect(occurrence?.declaration.kind).toBe("parameter");
    });

    it("resolves shadowed variables with the same name to the nearest declaration", async () => {
        const document = testDocument("scope-shadowing-same-name", [
            "let $x := 1",
            "let $x := $x + 1",
            "return $x",
        ]);

        const analysis = await buildAnalysis(document);
        const xDeclarations = analysis.definitions.filter(
            (declaration) => declaration.kind === "let" && declaration.name.qname.localName === "x",
        );

        expect(xDeclarations).toHaveLength(2);

        const references = analysis.references
            .filter(
                (reference) =>
                    reference.kind === "variable" && reference.name.qname.localName === "x",
            )
            .map((reference) => {
                if (isSourceDefinition(reference.declaration)) {
                    return {
                        line: reference.range.start.line,
                        declarationLine: reference.declaration.selectionRange.start.line,
                    };
                }
            });

        expect(references).toEqual([
            { line: 1, declarationLine: 0 }, /// The $x in the second line refers to the first declaration of $x
            { line: 2, declarationLine: 1 }, /// The $x in the third line refers to the second declaration of $x, which shadows the first one
        ]);
    });

    it("does not make an incomplete variable declaration visible from trailing initializer whitespace", async () => {
        const source = "declare variable $a := ";
        const document = testDocument("scope-incomplete-var-init", source);

        const visibleDeclarations = await getVisibleDeclarationsAtPosition(document, {
            line: 0,
            character: source.length,
        });

        expect(
            visibleDeclarations
                .filter((d) => d.kind === "declare-variable")
                .map((declaration) => declaration.name.qname.localName),
        ).not.toContain("$a");
    });

    it("makes a completed prolog variable visible after its semicolon", async () => {
        const source = "declare variable $a := 1; ";
        const document = testDocument("scope-complete-var-init", source);

        const visibleDeclarations = await getVisibleDeclarationsAtPosition(document, {
            line: 0,
            character: source.length,
        });

        expect(visibleDeclarations.map((declaration) => declaration.name)).toContainEqual({
            qname: { localName: "a" },
        });
    });

    it("does not make an incomplete let declaration visible", async () => {
        const source = "let $a := ";
        const document = testDocument("scope-incomplete-let-init", source);

        const visibleDeclarations = await getVisibleDeclarationsAtPosition(document, {
            line: 0,
            character: source.length,
        });

        expect(visibleDeclarations.length).toBe(0);
    });
});
