import { analyzeDocument } from "server/analysis/builder.js";
import { buildDocumentIndex } from "server/analysis/document-index.js";
import {
    findNodesThatContainPosition,
    findNodeThatContainsPosition,
    findSymbolAtPosition,
    getSourceDefinitions,
    getResolvedReferences,
    getVisibleDeclarationsAtPosition,
    getReferencesToDefinition,
} from "server/analysis/queries.js";
import { describe, expect, it } from "vitest";

import { parserService, workspaceService } from "./services.js";
import { positionAt, testDocument } from "./test-utils.js";

const buildAnalysis = (document: Parameters<typeof buildDocumentIndex>[0]) =>
    analyzeDocument(buildDocumentIndex(document, parserService.parse(document).ast));
const buildIndex = (document: Parameters<typeof buildDocumentIndex>[0]) =>
    buildDocumentIndex(document, parserService.parse(document).ast);

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
        const declarationNames = getSourceDefinitions(analysis).map(
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
        const references = getResolvedReferences(analysis)
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
                resolvedKind: "variable",
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
                resolvedKind: "variable",
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
        const functionReference = getResolvedReferences(analysis).find(
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

    it("resolves Prolog declarations throughout the Prolog", async () => {
        const document = testDocument("scope-prolog-forward-references", [
            "declare variable $result := local:add($later, 1);",
            "declare function local:add($left, $right) { $left + $right };",
            "declare variable $later := 41;",
            "$result",
        ]);

        const analysis = await buildAnalysis(document);

        expect(
            analysis.diagnostics.filter((diagnostic) => diagnostic.code?.startsWith("unresolved-")),
        ).toEqual([]);
        expect(
            getResolvedReferences(analysis)
                .filter(
                    (reference) =>
                        reference.range.start.line === 0 || reference.range.start.line === 3,
                )
                .map((reference) => ({
                    referenceLine: reference.range.start.line,
                    declarationLine: reference.declaration.selectionRange.start.line,
                })),
        ).toEqual([
            { referenceLine: 0, declarationLine: 1 },
            { referenceLine: 0, declarationLine: 2 },
            { referenceLine: 3, declarationLine: 0 },
        ]);
    });

    it("allows recursive Prolog functions but excludes a variable from its own initializer", async () => {
        const document = testDocument("scope-prolog-self-reference", [
            "declare function local:odd($n) { if ($n = 0) then false else local:even($n - 1) };",
            "declare function local:even($n) { if ($n = 0) then true else local:odd($n - 1) };",
            "declare variable $self := $self;",
        ]);

        const analysis = await buildAnalysis(document);

        expect(analysis.diagnostics.map((diagnostic) => diagnostic.code)).toEqual([
            "unresolved-variable",
        ]);
        expect(
            getResolvedReferences(analysis)
                .filter((reference) => reference.kind === "function")
                .map((reference) => reference.declaration.selectionRange.start.line),
        ).toEqual([1, 0]);
    });

    it("reports duplicate main-module Prolog declarations", () => {
        const index = buildIndex(
            testDocument("scope-duplicate-prolog-declarations", [
                "declare variable $value := 1;",
                "declare variable $value := 2;",
                "declare function local:value() { 1 };",
                "declare function local:value() { 2 };",
            ]),
        );

        expect(index.diagnostics.map((diagnostic) => diagnostic.code)).toEqual([
            "XQST0049",
            "XQST0034",
        ]);
    });

    it("keeps built-in function references isolated per document analysis", async () => {
        const firstAnalysis = await buildAnalysis(
            testDocument("scope-builtin-reference-first", ["count((1, 2))"]),
        );
        const secondAnalysis = await buildAnalysis(
            testDocument("scope-builtin-reference-second", ["count((1, 2)), count((3, 4))"]),
        );

        const firstReference = getResolvedReferences(firstAnalysis).find(
            (reference) =>
                reference.kind === "function" && reference.declaration.origin === "builtin",
        );
        const secondReference = getResolvedReferences(secondAnalysis).find(
            (reference) =>
                reference.kind === "function" && reference.declaration.origin === "builtin",
        );

        expect(firstReference).toBeDefined();
        expect(secondReference).toBeDefined();

        if (firstReference === undefined || secondReference === undefined) {
            return;
        }

        expect(firstReference.declaration).toBe(secondReference.declaration);
        expect(getReferencesToDefinition(firstAnalysis, firstReference.declaration)).toHaveLength(
            1,
        );
        expect(getReferencesToDefinition(secondAnalysis, secondReference.declaration)).toHaveLength(
            2,
        );
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
        const functionReference = getResolvedReferences(analysis).find(
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
        const functionReference = getResolvedReferences(analysis).find(
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

    it("resolves unprefixed builtin functions through the fn namespace", () => {
        const document = testDocument("scope-unprefixed-builtin", ['substring("hello", 1, 2)']);

        const analysis = workspaceService.getAnalysis(document);
        const functionReference = getResolvedReferences(analysis).find(
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
                kind: "function",
                origin: "builtin",
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

    it("represents predeclared namespaces without source declaration locations", () => {
        const analysis = buildAnalysis(
            testDocument("scope-predeclared-namespaces", "fn:string(1)"),
        );
        const fnNamespace = analysis.namespaces.get("fn");

        expect(fnNamespace).toMatchObject({
            kind: "namespace",
            origin: "implicit",
            name: { prefix: "fn" },
            namespaceUri: "http://www.w3.org/2005/xpath-functions",
        });
        expect(fnNamespace).not.toHaveProperty("range");
        expect(fnNamespace).not.toHaveProperty("selectionRange");
    });

    it("keeps namespace, type, function, and variable symbol spaces separate", () => {
        const document = testDocument("scope-separate-symbol-spaces", [
            'declare namespace app = "http://example.com/app";',
            "declare type app:item as object-node();",
            "declare function app:item() { 1 };",
            "declare variable $app:item := 1;",
            "($app:item, app:item())",
        ]);

        const analysis = workspaceService.getAnalysis(document);
        const position = positionAt(document, "($app:item");
        const visibleDefinitions = getVisibleDeclarationsAtPosition(
            analysis,
            document.offsetAt(position),
        );

        expect(analysis.namespaces.get("app")?.namespaceUri).toBe("http://example.com/app");
        expect(visibleDefinitions.map((definition) => definition.kind)).toEqual([
            "function",
            "variable",
            "type",
        ]);
    });

    it("supports multiple for variables in the same clause", async () => {
        const document = testDocument("scope-multi-for", [
            "for $x in (1, 2, 3), $y in ($x, 4)",
            "return 10 * $x + $y",
        ]);

        const analysis = await buildAnalysis(document);

        expect(getSourceDefinitions(analysis).map((declaration) => declaration.name)).toEqual([
            { localName: "x" },
            { localName: "y" },
        ]);
        expect(
            getResolvedReferences(analysis).map((reference) => ({
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
        const variableReferences = getResolvedReferences(analysis)
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
                resolvedKind: "variable",
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
                resolvedKind: "variable",
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
            getResolvedReferences(analysis)
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
                resolvedKind: "variable",
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
            getSourceDefinitions(analysis).filter((definition) => definition.kind === "variable"),
        ).toEqual([]);

        expect(
            getVisibleDeclarationsAtPosition(
                analysis,
                document.offsetAt(positionAt(document, "$err:code")),
            )
                .filter(
                    (definition) =>
                        definition.origin === "implicit" && definition.kind === "variable",
                )
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
            getResolvedReferences(analysis)
                .filter((reference) => reference.kind === "variable")
                .map((reference) => ({
                    name: reference.name,
                    resolvedTo: reference.declaration.name,
                    resolvedKind: reference.declaration.kind,
                    resolvedOrigin: reference.declaration.origin,
                })),
        ).toMatchObject([
            {
                name: { prefix: "err", localName: "code" },
                resolvedTo: { prefix: "err", localName: "code" },
                resolvedKind: "variable",
                resolvedOrigin: "implicit",
            },
            {
                name: { prefix: "err", localName: "description" },
                resolvedTo: { prefix: "err", localName: "description" },
                resolvedKind: "variable",
                resolvedOrigin: "implicit",
            },
        ]);

        expect(findSymbolAtPosition(analysis, positionAt(document, "catch"))).toBeUndefined();
    });

    it("supports multiple for bindings that each define an at-position variable", async () => {
        const document = testDocument("scope-multi-for-at", [
            "for $x at $ix in (1, 2), $y at $iy in ($x, 3)",
            "return $x + $ix + $y + $iy",
        ]);

        const analysis = await buildAnalysis(document);

        expect(
            getSourceDefinitions(analysis).map((declaration) => ({
                name: declaration.name,
                kind: declaration.kind,
            })),
        ).toEqual([
            { name: { localName: "x" }, kind: "variable" },
            { name: { localName: "ix" }, kind: "variable" },
            { name: { localName: "y" }, kind: "variable" },
            { name: { localName: "iy" }, kind: "variable" },
        ]);

        expect(
            getResolvedReferences(analysis).map((reference) => ({
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
                resolvedKind: "variable",
            },
            {
                name: { localName: "x" },
                line: 1,
                resolvedTo: { localName: "x" },
                resolvedKind: "variable",
            },
            {
                name: { localName: "ix" },
                line: 1,
                resolvedTo: { localName: "ix" },
                resolvedKind: "variable",
            },
            {
                name: { localName: "y" },
                line: 1,
                resolvedTo: { localName: "y" },
                resolvedKind: "variable",
            },
            {
                name: { localName: "iy" },
                line: 1,
                resolvedTo: { localName: "iy" },
                resolvedKind: "variable",
            },
        ]);
    });

    it("indexes references by declaration and supports occurrence lookup", async () => {
        const document = testDocument("scope-index", [
            "declare function local:f($x) {",
            "  let $y := $x + 1",
            "  return $y + $x",
            "};",
        ]);

        const analysis = await buildAnalysis(document);
        const parameter = getSourceDefinitions(analysis).find(
            (declaration) => declaration.kind === "parameter" && declaration.name.localName === "x",
        );

        expect(parameter).toBeDefined();

        if (parameter === undefined) {
            return;
        }

        expect(
            getReferencesToDefinition(analysis, parameter).map(
                (reference) => reference.range.start.line,
            ),
        ).toEqual([1, 2]);

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
        const parameter = getSourceDefinitions(analysis).find(
            (declaration) => declaration.kind === "parameter" && declaration.name.localName === "x",
        );

        expect(parameter).toBeDefined();

        if (parameter === undefined) {
            return;
        }

        expect(
            getReferencesToDefinition(analysis, parameter).map(
                (reference) => reference.range.start.line,
            ),
        ).toEqual([1, 1]);

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
        const xDeclarations = getSourceDefinitions(analysis).filter(
            (declaration) => declaration.kind === "variable" && declaration.name.localName === "x",
        );

        expect(xDeclarations).toHaveLength(2);

        const references = getResolvedReferences(analysis)
            .filter(
                (reference) => reference.kind === "variable" && reference.name.localName === "x",
            )
            .map((reference) => {
                if (reference.declaration.origin === "source") {
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

        const visibleDeclarations = getVisibleDeclarationsAtPosition(
            workspaceService.getAnalysis(document),
            source.length,
        );

        expect(
            visibleDeclarations
                .filter((d) => d.kind === "variable")
                .map((declaration) => declaration.name.localName),
        ).not.toContain("a");
    });

    it("makes a completed prolog variable visible after its semicolon", async () => {
        const source = "declare variable $a := 1; ";
        const document = testDocument("scope-complete-var-init", source);

        const visibleDeclarations = getVisibleDeclarationsAtPosition(
            workspaceService.getAnalysis(document),
            source.length,
        );

        expect(visibleDeclarations.map((declaration) => declaration.name)).toContainEqual({
            localName: "a",
        });
    });

    it("does not make an incomplete let declaration visible", async () => {
        const source = "let $a := ";
        const document = testDocument("scope-incomplete-let-init", source);

        const visibleDeclarations = getVisibleDeclarationsAtPosition(
            workspaceService.getAnalysis(document),
            source.length,
        );

        expect(visibleDeclarations.length).toBe(0);
    });
});
