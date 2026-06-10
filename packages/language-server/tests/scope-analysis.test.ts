import { buildAnalysis } from "server/analysis/builder.js";
import { isSourceDefinition } from "server/analysis/definitions.js";
import {
    findNodesThatContainPosition,
    findNodeThatContainsPosition,
    findSymbolAtPosition,
    collectDefinitions,
    collectReferences,
    getVisibleDeclarationsAtPosition,
} from "server/analysis/queries.js";
import { getAnalysis } from "server/analysis/service.js";
import { describe, expect, it } from "vitest";

import { positionAt, testDocument } from "./test-utils.js";

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
        const declarationNames = collectDefinitions(analysis).map(
            (declaration) => declaration.name,
        );

        expect(declarationNames).toMatchObject([
            {
                arity: 2,
                qname: {
                    localName: "f",
                    prefix: "local",
                },
            },
            {
                localName: "a",
            },
            {
                localName: "b",
            },
            {
                localName: "x",
            },
            {
                localName: "pos",
            },

            { localName: "y" },
            { localName: "g" },
            {
                localName: "c",
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
        const references = collectReferences(analysis)
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
                    localName: "x",
                },
                line: 2,
                resolvedTo: { localName: "x" },
                resolvedKind: "parameter",
            },
            {
                name: { localName: "y" },
                line: 3,
                resolvedTo: { localName: "y" },
                resolvedKind: "let",
            },
            {
                name: { localName: "x" },
                line: 3,
                resolvedTo: {
                    localName: "x",
                },
                resolvedKind: "parameter",
            },
            {
                name: {
                    localName: "x",
                },
                line: 5,
                resolvedTo: {
                    localName: "x",
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
        const functionReference = collectReferences(analysis).find(
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
        const functionReference = collectReferences(analysis).find(
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
        const functionReference = collectReferences(analysis).find(
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

    it("resolves unprefixed builtin functions through the fn namespace", async () => {
        const document = testDocument("scope-unprefixed-builtin", ['substring("hello", 1, 2)']);

        const analysis = await getAnalysis(document);
        const functionReference = collectReferences(analysis).find(
            (reference) => reference.kind === "function",
        );

        expect(functionReference).toMatchObject({
            name: {
                arity: 3,
                qname: {
                    localName: "substring",
                },
            },
            declaration: {
                kind: "builtin-function",
                name: {
                    arity: 3,
                    qname: {
                        localName: "substring",
                        namespaceUri: "http://www.w3.org/2005/xpath-functions",
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

        expect(collectDefinitions(analysis).map((declaration) => declaration.name)).toEqual([
            { localName: "x" },
            { localName: "y" },
        ]);
        expect(
            collectReferences(analysis).map((reference) => ({
                name: reference.name,
                line: reference.range.start.line,
                resolvedTo: reference.declaration?.name,
            })),
        ).toEqual([
            {
                name: { localName: "x" },
                line: 0,
                resolvedTo: { localName: "x" },
            },
            {
                name: { localName: "x" },
                line: 1,
                resolvedTo: { localName: "x" },
            },
            {
                name: { localName: "y" },
                line: 1,
                resolvedTo: { localName: "y" },
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
        const variableReferences = collectReferences(analysis)
            .filter((reference) => reference.kind === "variable")
            .map((reference) => ({
                name: reference.name,
                resolvedTo: reference.declaration.name,
                resolvedKind: reference.declaration.kind,
            }));

        expect(variableReferences).toEqual([
            {
                name: {
                    prefix: "other",
                    localName: "value",
                    namespaceUri: "http://example.com/other",
                },
                resolvedTo: {
                    prefix: "other",
                    localName: "value",
                    namespaceUri: "http://example.com/other",
                },
                resolvedKind: "declare-variable",
            },
            {
                name: {
                    prefix: "local",
                    localName: "value",
                    namespaceUri: "http://example.com/local",
                },
                resolvedTo: {
                    prefix: "local",
                    localName: "value",
                    namespaceUri: "http://example.com/local",
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
            collectReferences(analysis)
                .filter((reference) => reference.kind === "variable")
                .map((reference) => ({
                    name: reference.name,
                    resolvedTo: reference.declaration.name,
                    resolvedKind: reference.declaration.kind,
                })),
        ).toEqual([
            {
                name: {
                    prefix: "b",
                    localName: "value",
                    namespaceUri: "http://example.com/shared",
                },
                resolvedTo: {
                    prefix: "a",
                    localName: "value",
                    namespaceUri: "http://example.com/shared",
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
            collectDefinitions(analysis)
                .filter((definition) => definition.kind === "catch-variable")
                .map((definition) => definition.name),
        ).toMatchObject([
            { prefix: "err", localName: "code" },
            { prefix: "err", localName: "description" },
            { prefix: "err", localName: "value" },
            { prefix: "err", localName: "module" },
            { prefix: "err", localName: "line-number" },
            { prefix: "err", localName: "column-number" },
            { prefix: "err", localName: "additional" },
        ]);

        expect(
            collectReferences(analysis)
                .filter((reference) => reference.kind === "variable")
                .map((reference) => ({
                    name: reference.name,
                    resolvedTo: reference.declaration.name,
                    resolvedKind: reference.declaration.kind,
                })),
        ).toMatchObject([
            {
                name: { prefix: "err", localName: "code" },
                resolvedTo: { prefix: "err", localName: "code" },
                resolvedKind: "catch-variable",
            },
            {
                name: { prefix: "err", localName: "description" },
                resolvedTo: { prefix: "err", localName: "description" },
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
            collectDefinitions(analysis).map((declaration) => ({
                name: declaration.name,
                kind: declaration.kind,
            })),
        ).toEqual([
            { name: { localName: "x" }, kind: "for" },
            { name: { localName: "ix" }, kind: "for-position" },
            { name: { localName: "y" }, kind: "for" },
            { name: { localName: "iy" }, kind: "for-position" },
        ]);

        expect(
            collectReferences(analysis).map((reference) => ({
                name: reference.name,
                line: reference.range.start.line,
                resolvedTo: reference.declaration?.name,
                resolvedKind: reference.declaration?.kind,
            })),
        ).toEqual([
            {
                name: { localName: "x" },
                line: 0,
                resolvedTo: { localName: "x" },
                resolvedKind: "for",
            },
            {
                name: { localName: "x" },
                line: 1,
                resolvedTo: { localName: "x" },
                resolvedKind: "for",
            },
            {
                name: { localName: "ix" },
                line: 1,
                resolvedTo: { localName: "ix" },
                resolvedKind: "for-position",
            },
            {
                name: { localName: "y" },
                line: 1,
                resolvedTo: { localName: "y" },
                resolvedKind: "for",
            },
            {
                name: { localName: "iy" },
                line: 1,
                resolvedTo: { localName: "iy" },
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
        const parameter = collectDefinitions(analysis).find(
            (declaration) => declaration.kind === "parameter" && declaration.name.localName === "x",
        );

        expect(parameter).toBeDefined();

        if (parameter === undefined) {
            return;
        }

        expect(parameter.references.map((reference) => reference.range.start.line)).toEqual([1, 2]);

        const occurrence = findSymbolAtPosition(analysis, { line: 2, character: 14 });

        expect(occurrence?.reference).toBeDefined();
        expect(occurrence?.declaration.name).toEqual({ localName: "x" });
        expect(occurrence?.declaration.kind).toBe("parameter");
    });

    it("returns correct declaration for reference on the same line as declaration", async () => {
        const document = testDocument("scope-same-line", [
            "declare function local:f($x) {",
            "  let $y := $x + 1 return $y + $x",
            "};",
        ]);

        const analysis = await buildAnalysis(document);
        const parameter = collectDefinitions(analysis).find(
            (declaration) => declaration.kind === "parameter" && declaration.name.localName === "x",
        );

        expect(parameter).toBeDefined();

        if (parameter === undefined) {
            return;
        }

        expect(parameter.references.map((reference) => reference.range.start.line)).toEqual([1, 1]);

        const occurrence = findSymbolAtPosition(analysis, { line: 1, character: 13 });

        expect(occurrence?.reference).toBeDefined();
        expect(occurrence?.declaration.name).toEqual({ localName: "x" });
        expect(occurrence?.declaration.kind).toBe("parameter");
    });

    it("finds the innermost node that contains a position", async () => {
        const document = testDocument("scope-find-node", ["sum((1, local:add(2, 3)))"]);
        const analysis = await buildAnalysis(document);

        const containingNodes = findNodesThatContainPosition(analysis, positionAt(document, "2"));
        const functionNode = findNodeThatContainsPosition(analysis, positionAt(document, "add"));
        const argumentNode = findNodeThatContainsPosition(analysis, positionAt(document, "2"));

        expect(containingNodes.map((node) => node.kind)).toEqual([
            "module",
            "function-call",
            "argument",
            "function-call",
            "argument",
        ]);
        expect(functionNode?.kind).toBe("reference");
        expect(functionNode).toMatchObject({
            referenceKind: "function",
            name: {
                qname: {
                    prefix: "local",
                    localName: "add",
                },
            },
        });
        expect(argumentNode?.kind).toBe("argument");
    });

    it("prefers nested nodes over outer nodes when positions overlap", async () => {
        const document = testDocument("scope-find-node-nested", [
            "sum(local:add(2, local:mul(3, 4)))",
        ]);
        const analysis = await buildAnalysis(document);

        const node = findNodeThatContainsPosition(analysis, positionAt(document, "mul"));

        expect(node?.kind).toBe("reference");
        expect(node).toMatchObject({
            referenceKind: "function",
            name: {
                qname: {
                    prefix: "local",
                    localName: "mul",
                },
            },
        });
    });

    it("resolves shadowed variables with the same name to the nearest declaration", async () => {
        const document = testDocument("scope-shadowing-same-name", [
            "let $x := 1",
            "let $x := $x + 1",
            "return $x",
        ]);

        const analysis = await buildAnalysis(document);
        const xDeclarations = collectDefinitions(analysis).filter(
            (declaration) => declaration.kind === "let" && declaration.name.localName === "x",
        );

        expect(xDeclarations).toHaveLength(2);

        const references = collectReferences(analysis)
            .filter(
                (reference) => reference.kind === "variable" && reference.name.localName === "x",
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
                .map((declaration) => declaration.name.localName),
        ).not.toContain("a");
    });

    it("makes a completed prolog variable visible after its semicolon", async () => {
        const source = "declare variable $a := 1; ";
        const document = testDocument("scope-complete-var-init", source);

        const visibleDeclarations = await getVisibleDeclarationsAtPosition(document, {
            line: 0,
            character: source.length,
        });

        expect(visibleDeclarations.map((declaration) => declaration.name)).toContainEqual({
            localName: "a",
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
