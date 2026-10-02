import { type ParseTree, type TerminalNode } from "antlr4ng";
import {
    type AstNode,
    type AstParameter,
    type VariableDeclarationAstNode,
} from "server/parser/types/ast.js";
import { parseQNameText } from "server/parser/types/name.js";
import { rangeFromNode } from "server/utils/range.js";
import type { TextDocument } from "vscode-languageserver-textdocument";

import type * as jsoniq from "../adapters/jsoniq/grammar/JsoniqParser.js";
import type * as xquery from "../adapters/xquery/grammar/XQueryParser.js";
import { parseFunctionName, parseVarName } from "./name.js";

type CatchCaseStatementContext =
    | jsoniq.CatchCaseStatementContext
    | xquery.CatchCaseStatementContext;
type CatchClauseContext = jsoniq.CatchClauseContext | xquery.CatchClauseContext;
type CaseClauseContext = jsoniq.CaseClauseContext | xquery.CaseClauseContext;
type CaseStatementContext = jsoniq.CaseStatementContext | xquery.CaseStatementContext;
type CountClauseContext = jsoniq.CountClauseContext | xquery.CountClauseContext;
type ContextItemDeclContext = jsoniq.ContextItemDeclContext | xquery.ContextItemDeclContext;
type ContextItemExprContext = jsoniq.ContextItemExprContext | xquery.ContextItemExprContext;
type FlworExprContext = jsoniq.FlworExprContext | xquery.FlworExprContext;
type FlworStatementContext = jsoniq.FlworStatementContext | xquery.FlworStatementContext;
type ForVarContext = jsoniq.ForVarContext | xquery.ForVarContext;
type FunctionCallContext = jsoniq.FunctionCallContext | xquery.FunctionCallContext;
type FunctionDeclContext = jsoniq.FunctionDeclContext | xquery.FunctionDeclContext;
type GroupByClauseContext = jsoniq.GroupByClauseContext | xquery.GroupByClauseContext;
type InlineFunctionExprContext =
    | jsoniq.InlineFunctionExprContext
    | xquery.InlineFunctionExprContext;
type LetVarContext = jsoniq.LetVarContext | xquery.LetVarContext;
type NamedFunctionRefContext = jsoniq.NamedFunctionRefContext | xquery.NamedFunctionRefContext;
type NamespaceDeclContext = jsoniq.NamespaceDeclContext | xquery.NamespaceDeclContext;
type DefaultNamespaceDeclContext =
    | jsoniq.DefaultNamespaceDeclContext
    | xquery.DefaultNamespaceDeclContext;
type SchemaImportContext = jsoniq.SchemaImportContext | xquery.SchemaImportContext;
type BaseURIDeclContext = jsoniq.BaseURIDeclContext | xquery.BaseURIDeclContext;
type LibraryModuleContext = jsoniq.LibraryModuleContext | xquery.LibraryModuleContext;
type ModuleImportContext = jsoniq.ModuleImportContext | xquery.ModuleImportContext;
type QuantifiedExprVarContext = jsoniq.QuantifiedExprVarContext | xquery.QuantifiedExprVarContext;
type SlidingWindowClauseContext =
    | jsoniq.SlidingWindowClauseContext
    | xquery.SlidingWindowClauseContext;
type TumblingWindowClauseContext =
    | jsoniq.TumblingWindowClauseContext
    | xquery.TumblingWindowClauseContext;
type TypeSwitchStatementContext =
    | jsoniq.TypeSwitchStatementContext
    | xquery.TypeSwitchStatementContext;
type TypeswitchExprContext = jsoniq.TypeswitchExprContext | xquery.TypeswitchExprContext;
type VarDeclContext = jsoniq.VarDeclContext | xquery.VarDeclContext;
type VarBindingContext = jsoniq.VarBindingContext | xquery.VarBindingContext;
type VarRefContext = jsoniq.VarRefContext | xquery.VarRefContext;
type WindowVarsContext = jsoniq.WindowVarsContext | xquery.WindowVarsContext;
type ModuleAndThisIsItContext = jsoniq.ModuleAndThisIsItContext | xquery.ModuleAndThisIsItContext;
type NameTestContext = jsoniq.NameTestContext | xquery.NameTestContext;

type WindowStartConditionContext =
    | jsoniq.WindowStartConditionContext
    | xquery.WindowStartConditionContext;
type WindowEndConditionContext =
    | jsoniq.WindowEndConditionContext
    | xquery.WindowEndConditionContext;
type VarDeclStatementContext = jsoniq.VarDeclStatementContext | xquery.VarDeclStatementContext;
type TransformExprContext = jsoniq.TransformExprContext | xquery.TransformExprContext;
type ArgumentListContext = jsoniq.ArgumentListContext | xquery.ArgumentListContext;
type GroupByVarContext = jsoniq.GroupByVarContext | xquery.GroupByVarContext;
type VarDeclForStatementContext =
    | jsoniq.VarDeclForStatementContext
    | xquery.VarDeclForStatementContext;
type CopyDeclContext = jsoniq.CopyDeclContext | xquery.CopyDeclContext;
type ArgumentContext = jsoniq.ArgumentContext | xquery.ArgumentContext;
export type AstVisitResult = AstNode[];

interface AstTraversal {
    visit(node: ParseTree | null | undefined): AstVisitResult;
    visitChildren(node: ParseTree): AstVisitResult;
}

function unquoteStringLiteral(text: string): string {
    return text.length >= 2 &&
        ((text.startsWith('"') && text.endsWith('"')) ||
            (text.startsWith("'") && text.endsWith("'")))
        ? text.slice(1, -1)
        : text;
}

function hasPrivateAnnotation(node: FunctionDeclContext | VarDeclContext): boolean {
    return (
        node
            .annotations()
            ?.annotation()
            .some((annotation) => {
                const name = annotation._name?.getText() ?? "";
                return name === "private" || name.endsWith(":private") || name.endsWith("}private");
            }) ?? false
    );
}

/** Translates common grammar rules; child traversal dispatches through the language visitor. */
export class CommonAstBuilder {
    public constructor(
        private readonly document: TextDocument,
        private readonly traversal: AstTraversal,
    ) {}

    public visitModuleAndThisIsIt = (node: ModuleAndThisIsItContext): AstVisitResult => [
        {
            kind: "module",
            range: rangeFromNode(node, this.document),
            children: this.traversal.visitChildren(node),
        },
    ];

    public visitLibraryModule = (node: LibraryModuleContext): AstVisitResult => {
        const prefix = node.ncName();
        const namespace = node.uriLiteral();
        return [
            {
                kind: "module-declaration",
                prefix: prefix.getText().trim(),
                namespaceUri: unquoteStringLiteral(namespace.getText()),
                range: {
                    start: rangeFromNode(node.KW_MODULE(), this.document).start,
                    end: rangeFromNode(node.SEMICOLON(), this.document).end,
                },
                selectionRange: rangeFromNode(prefix, this.document),
                children: this.traversal.visitChildren(node),
            },
        ];
    };

    public visitModuleImport = (node: ModuleImportContext): AstVisitResult => {
        const target = node._targetNamespace;
        if (target === undefined) return [];
        return [
            {
                kind: "module-import",
                ...(node._prefix === undefined ? {} : { prefix: node._prefix.getText().trim() }),
                ...(node._prefix === undefined
                    ? {}
                    : { prefixRange: rangeFromNode(node._prefix, this.document) }),
                namespaceUri: unquoteStringLiteral(target.getText()),
                namespaceUriRange: rangeFromNode(target, this.document),
                locations: node._locations.map((location) => ({
                    uri: unquoteStringLiteral(location.getText()),
                    range: rangeFromNode(location, this.document),
                })),
                range: rangeFromNode(node, this.document),
                children: [],
            },
        ];
    };

    public visitBaseURIDecl = (node: BaseURIDeclContext): AstVisitResult => [
        {
            kind: "base-uri-declaration",
            uri: unquoteStringLiteral(node.uriLiteral().getText()),
            range: rangeFromNode(node, this.document),
            children: [],
        },
    ];

    public visitSchemaImport = (node: SchemaImportContext): AstVisitResult => {
        const namespaceUri = node._nsURI;
        if (namespaceUri === undefined) return [];
        const prefix = node.schemaPrefix()?.ncName();
        return [
            {
                kind: "schema-import",
                ...(prefix == null
                    ? {}
                    : {
                          prefix: prefix.getText().trim(),
                          prefixRange: rangeFromNode(prefix, this.document),
                      }),
                defaultElementNamespace: node.schemaPrefix()?.KW_DEFAULT() != null,
                namespaceUri: unquoteStringLiteral(namespaceUri.getText()),
                namespaceUriRange: rangeFromNode(namespaceUri, this.document),
                locations: node._locations.map((location) => ({
                    uri: unquoteStringLiteral(location.getText()),
                    range: rangeFromNode(location, this.document),
                })),
                range: rangeFromNode(node, this.document),
                children: [],
            },
        ];
    };

    public visitDefaultNamespaceDecl = (node: DefaultNamespaceDeclContext): AstVisitResult => [
        {
            kind: "default-namespace-declaration",
            namespaceKind: node.KW_ELEMENT() === null ? "function" : "element",
            namespaceUri: unquoteStringLiteral(node.stringLiteral().getText()),
            namespaceUriRange: rangeFromNode(node.stringLiteral(), this.document),
            range: rangeFromNode(node, this.document),
            children: [],
        },
    ];

    public visitNamespaceDecl = (node: NamespaceDeclContext): AstVisitResult => {
        const nameNode = node.ncName();
        if (nameNode === null) {
            return [];
        }

        const prefix = nameNode.getText().trim();
        if (prefix === "") {
            return [];
        }

        const namespaceUriNode = node.uriLiteral();
        if (namespaceUriNode === null) {
            return [];
        }

        return [
            {
                kind: "namespace-declaration",
                prefix,
                namespaceUri: unquoteStringLiteral(namespaceUriNode.getText()),
                range: rangeFromNode(node, this.document),
                selectionRange: rangeFromNode(nameNode, this.document),
                children: [],
            },
        ];
    };

    public visitContextItemDecl = (node: ContextItemDeclContext): AstVisitResult => [
        {
            kind: "context-item-declaration",
            name: {
                kind: "unprefixed-qname",
                localName: "$",
            },
            range: rangeFromNode(node, this.document),
            selectionRange: {
                start: rangeFromNode(node.KW_CONTEXT(), this.document).start,
                end: rangeFromNode(node.KW_ITEM(), this.document).end,
            },
            children: [],
        },
    ];

    public visitContextItemExpr = (node: ContextItemExprContext): AstVisitResult => [
        {
            kind: "context-item-expression",
            name: { kind: "unprefixed-qname", localName: "$" },
            range: rangeFromNode(node, this.document),
            children: [],
        },
    ];

    public visitFunctionDecl = (node: FunctionDeclContext): AstVisitResult => [
        {
            kind: "function-declaration",
            range: rangeFromNode(node, this.document),
            name: parseFunctionName(node, node.paramList()?.param().length ?? 0),
            selectionRange: rangeFromNode(node.functionName(), this.document),
            parameters: this.buildParameters(node),
            isPrivate: hasPrivateAnnotation(node),
            children: this.traversal.visitChildren(node),
        },
    ];

    private buildVariableDeclaration(
        node: VarBindingContext | null | undefined,
        visibleFrom: VariableDeclarationAstNode["visibleFrom"] | null,
    ): VariableDeclarationAstNode | null {
        if (node === null || node === undefined || visibleFrom === null) {
            return null;
        }

        const name = parseVarName(node);

        return name === null
            ? null
            : {
                  kind: "variable-declaration",
                  name,
                  range: rangeFromNode(node, this.document),
                  selectionRange: rangeFromNode(node, this.document),
                  visibleFrom,
                  isPrivate: false,
                  children: [],
              };
    }

    private declarationsBeforeChildren(
        node: ParseTree,
        declarations: Array<VariableDeclarationAstNode | null>,
    ): AstVisitResult {
        return [
            ...declarations.filter(
                (declaration): declaration is VariableDeclarationAstNode => declaration !== null,
            ),
            ...this.traversal.visitChildren(node),
        ];
    }

    private declarationWithChildren(
        node: ParseTree,
        declaration: VariableDeclarationAstNode | null,
    ): AstVisitResult {
        return declaration === null
            ? this.traversal.visitChildren(node)
            : [
                  {
                      ...declaration,
                      range: rangeFromNode(node, this.document),
                      children: this.traversal.visitChildren(node),
                  },
              ];
    }

    public visitVarDecl = (node: VarDeclContext): AstVisitResult => {
        const terminator = node.SEMICOLON();
        const visibleFrom =
            terminator === null || terminator.symbol.tokenIndex < 0
                ? null
                : rangeFromNode(terminator, this.document).end;
        const declaration = this.buildVariableDeclaration(node.varBinding(), visibleFrom);
        return this.declarationWithChildren(
            node,
            declaration === null ? null : { ...declaration, isPrivate: hasPrivateAnnotation(node) },
        );
    };

    public visitForVar = (node: ForVarContext): AstVisitResult => {
        const expression = node._ex;
        const visibleFrom =
            expression === undefined ? null : rangeFromNode(expression, this.document).end;
        return this.declarationsBeforeChildren(node, [
            this.buildVariableDeclaration(node._var_ref, visibleFrom),
            this.buildVariableDeclaration(node._at, visibleFrom),
        ]);
    };

    public visitLetVar = (node: LetVarContext): AstVisitResult => {
        const expression = node._ex;
        const visibleFrom =
            expression === undefined ? null : rangeFromNode(expression, this.document).end;
        return this.declarationWithChildren(
            node,
            this.buildVariableDeclaration(node._var_ref, visibleFrom),
        );
    };

    public visitTumblingWindowClause = (node: TumblingWindowClauseContext): AstVisitResult =>
        this.declarationsBeforeChildren(node, [
            this.buildVariableDeclaration(node._name, rangeFromNode(node, this.document).end),
        ]);

    public visitSlidingWindowClause = (node: SlidingWindowClauseContext): AstVisitResult =>
        this.declarationsBeforeChildren(node, [
            this.buildVariableDeclaration(node._name, rangeFromNode(node, this.document).end),
        ]);

    public visitWindowStartCondition = (node: WindowStartConditionContext): AstVisitResult =>
        this.visitWindowCondition(node);

    public visitWindowEndCondition = (node: WindowEndConditionContext): AstVisitResult =>
        this.visitWindowCondition(node);

    private visitWindowCondition(
        node: WindowStartConditionContext | WindowEndConditionContext,
    ): AstVisitResult {
        const variables = node.windowVars();
        const expression = node.exprSingle();
        const visibleFrom =
            expression == null ? null : rangeFromNode(expression, this.document).start;
        return [
            ...this.visitWindowVars(variables, visibleFrom),
            ...this.traversal.visit(expression),
        ];
    }

    private visitWindowVars(
        node: WindowVarsContext | null | undefined,
        visibleFrom: VariableDeclarationAstNode["visibleFrom"] | null,
    ): AstVisitResult {
        if (node == null) return [];
        return [
            this.buildVariableDeclaration(node._currentItem, visibleFrom),
            this.buildVariableDeclaration(node._previousItem, visibleFrom),
            this.buildVariableDeclaration(node._nextItem, visibleFrom),
            this.buildVariableDeclaration(node.positionalVar()?._pvar, visibleFrom),
        ].filter((declaration): declaration is VariableDeclarationAstNode => declaration !== null);
    }

    public visitCountClause = (node: CountClauseContext): AstVisitResult =>
        this.declarationsBeforeChildren(node, [
            this.buildVariableDeclaration(
                node.varBinding(),
                rangeFromNode(node, this.document).end,
            ),
        ]);

    public visitGroupByClause = (node: GroupByClauseContext): AstVisitResult => {
        const visibleFrom = rangeFromNode(node, this.document).end;
        return node.groupByVar().flatMap((binding) => this.visitGroupByVar(binding, visibleFrom));
    };

    private visitGroupByVar(
        node: GroupByVarContext,
        visibleFrom: VariableDeclarationAstNode["visibleFrom"],
    ): AstVisitResult {
        return this.declarationsBeforeChildren(node, [
            this.buildVariableDeclaration(node._var_ref, visibleFrom),
        ]);
    }

    public visitQuantifiedExprVar = (node: QuantifiedExprVarContext): AstVisitResult => {
        const expression = node.exprSingle();
        return this.declarationsBeforeChildren(node, [
            this.buildVariableDeclaration(
                node._var_ref,
                rangeFromNode(expression, this.document).end,
            ),
        ]);
    };

    public visitTypeswitchExpr = (node: TypeswitchExprContext): AstVisitResult =>
        this.declarationsBeforeChildren(node, [
            this.buildVariableDeclaration(
                node._var_ref,
                node._def === undefined ? null : rangeFromNode(node._def, this.document).start,
            ),
        ]);

    public visitCaseClause = (node: CaseClauseContext): AstVisitResult =>
        this.declarationsBeforeChildren(node, [
            this.buildVariableDeclaration(
                node._var_ref,
                node._ret === undefined ? null : rangeFromNode(node._ret, this.document).start,
            ),
        ]);

    public visitInlineFunctionExpr = (node: InlineFunctionExprContext): AstVisitResult => {
        const bodyStart = node.LBRACE();
        const visibleFrom = bodyStart === null ? null : rangeFromNode(bodyStart, this.document).end;
        const declarations =
            node
                .paramList()
                ?.param()
                .map((param) => this.buildVariableDeclaration(param._name, visibleFrom)) ?? [];

        return this.declarationsBeforeChildren(node, declarations);
    };

    public visitTypeSwitchStatement = (node: TypeSwitchStatementContext): AstVisitResult =>
        this.declarationsBeforeChildren(node, [
            this.buildVariableDeclaration(
                node._var_ref,
                node._def === undefined ? null : rangeFromNode(node._def, this.document).start,
            ),
        ]);

    public visitCaseStatement = (node: CaseStatementContext): AstVisitResult =>
        this.declarationsBeforeChildren(node, [
            this.buildVariableDeclaration(
                node._var_ref,
                node._ret === undefined ? null : rangeFromNode(node._ret, this.document).start,
            ),
        ]);

    public visitVarDeclStatement = (node: VarDeclStatementContext): AstVisitResult => {
        const terminator = node.SEMICOLON();
        const visibleFrom =
            terminator === null || terminator.symbol.tokenIndex < 0
                ? null
                : rangeFromNode(terminator, this.document).end;
        return [
            ...this.traversal.visit(node.annotations()),
            ...node
                .varDeclForStatement()
                .flatMap((binding) => this.visitVarDeclForStatement(binding, visibleFrom)),
        ];
    };

    private visitVarDeclForStatement(
        node: VarDeclForStatementContext,
        visibleFrom: VariableDeclarationAstNode["visibleFrom"] | null,
    ): AstVisitResult {
        return this.declarationsBeforeChildren(node, [
            this.buildVariableDeclaration(node._var_ref, visibleFrom),
        ]);
    }

    public visitTransformExpr = (node: TransformExprContext): AstVisitResult => {
        const expression = node._mod_expr;
        const visibleFrom =
            expression === undefined ? null : rangeFromNode(expression, this.document).start;
        return [
            ...node.copyDecl().flatMap((copy) => this.visitCopyDecl(copy, visibleFrom)),
            ...this.traversal.visit(expression),
            ...this.traversal.visit(node._ret_expr),
        ];
    };

    private visitCopyDecl(
        node: CopyDeclContext,
        visibleFrom: VariableDeclarationAstNode["visibleFrom"] | null,
    ): AstVisitResult {
        return this.declarationsBeforeChildren(node, [
            this.buildVariableDeclaration(node._var_ref, visibleFrom),
        ]);
    }

    public visitFlworExpr = (node: FlworExprContext): AstVisitResult => [
        {
            kind: "flowr-expression",
            range: rangeFromNode(node, this.document),
            children: this.traversal.visitChildren(node),
        },
    ];

    public visitFlworStatement = (node: FlworStatementContext): AstVisitResult => [
        {
            kind: "flowr-expression",
            range: rangeFromNode(node, this.document),
            children: this.traversal.visitChildren(node),
        },
    ];

    public visitVarRef = (node: VarRefContext): AstVisitResult => {
        const name = parseVarName(node);
        return name === null
            ? []
            : [
                  {
                      kind: "variable-reference",
                      name,
                      range: rangeFromNode(node, this.document),
                      children: [],
                  },
              ];
    };

    public visitCatchCaseStatement = (node: CatchCaseStatementContext): AstVisitResult =>
        this.buildCatchClause(node, node._catch_block?.LBRACE(), node._catch_block);

    public visitCatchClause = (node: CatchClauseContext): AstVisitResult =>
        this.buildCatchClause(node, node.LBRACE(), node._catch_expression);

    private buildCatchErrorTarget(node: NameTestContext): AstVisitResult {
        const name = node.eqName();
        return [
            {
                kind: "catch-error-target",
                target:
                    name === null
                        ? { kind: "wildcard", value: node.getText() }
                        : { kind: "exact", name: parseQNameText(name.getText()) },
                range: rangeFromNode(node, this.document),
                children: [],
            },
        ];
    }

    public visitArgumentList = (node: ArgumentListContext): AstVisitResult =>
        node.argument().flatMap((argument, index) => this.visitArgument(argument, index));

    private visitArgument(node: ArgumentContext, index: number): AstVisitResult {
        return [
            {
                kind: "argument",
                range: rangeFromNode(node, this.document),
                children: this.traversal.visitChildren(node),
                index,
            },
        ];
    }

    private buildParameters(node: FunctionDeclContext): AstParameter[] {
        const parameters: AstParameter[] = [];

        for (const [index, param] of node.paramList()?.param().entries() ?? []) {
            const nameNode = param._name;
            if (nameNode === undefined) {
                continue;
            }

            const paramName = parseVarName(nameNode);
            if (paramName === null) {
                continue;
            }

            const selectionRange = rangeFromNode(nameNode, this.document);
            parameters.push({
                name: paramName,
                range: rangeFromNode(param, this.document),
                selectionRange,
                index,
            });
        }

        return parameters;
    }

    public visitFunctionCall = (node: FunctionCallContext): AstVisitResult => {
        const nameNode = node._fn_name;
        const name = parseFunctionName(node, node.argumentList()?.argument().length);
        if (nameNode === undefined) {
            return [];
        }

        const children = this.traversal.visitChildren(node);

        return [
            {
                kind: "function-call",
                name,
                selectionRange: rangeFromNode(nameNode, this.document),
                range: rangeFromNode(node, this.document),
                children,
            },
        ];
    };

    public visitNamedFunctionRef = (node: NamedFunctionRefContext): AstVisitResult => {
        const nameNode = node._fn_name;
        const arity = Number.parseInt(
            node._arity?.text ?? node.IntegerLiteral()?.getText() ?? "",
            10,
        );
        const name = parseFunctionName(node, Number.isNaN(arity) ? undefined : arity);
        return nameNode !== undefined
            ? [
                  {
                      kind: "named-function-reference",
                      name,
                      selectionRange: rangeFromNode(nameNode, this.document),
                      range: rangeFromNode(node, this.document),
                      children: [],
                  },
              ]
            : [];
    };

    private buildCatchClause(
        node: CatchCaseStatementContext | CatchClauseContext,
        bodyStart: TerminalNode | null | undefined,
        body: ParseTree | null | undefined,
    ): AstVisitResult {
        return [
            {
                kind: "catch-clause",
                range: rangeFromNode(node, this.document),
                bodyStart:
                    bodyStart == null
                        ? rangeFromNode(node, this.document).start
                        : rangeFromNode(bodyStart, this.document).end,
                children: [
                    ...node.nameTest().flatMap((target) => this.buildCatchErrorTarget(target)),
                    ...this.traversal.visit(body),
                ],
            },
        ];
    }
}
