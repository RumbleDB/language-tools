import { type ParseTree } from "antlr4ng";
import {
    type AstNode,
    type AstParameter,
    type ModuleAstNode,
    type VariableDeclarationAstNode,
} from "server/parser/types/ast.js";
import { rangeFromNode } from "server/utils/range.js";
import { TextDocument } from "vscode-languageserver-textdocument";

import {
    CatchCaseStatementContext,
    CatchClauseContext,
    CaseClauseContext,
    CaseStatementContext,
    CopyDeclContext,
    CountClauseContext,
    ContextItemDeclContext,
    ContextItemExprContext,
    FlworExprContext,
    FlworStatementContext,
    ForVarContext,
    FunctionCallContext,
    FunctionDeclContext,
    GroupByVarContext,
    InlineFunctionExprContext,
    LetVarContext,
    NamedFunctionRefContext,
    NamespaceDeclContext,
    LibraryModuleContext,
    ModuleImportContext,
    PositionalVarContext,
    QuantifiedExprVarContext,
    SlidingWindowClauseContext,
    TransformExprContext,
    TumblingWindowClauseContext,
    TypeDeclContext,
    TypeSwitchStatementContext,
    TypeswitchExprContext,
    VarDeclContext,
    VarDeclForStatementContext,
    VarDeclStatementContext,
    VarBindingContext,
    VarRefContext,
    WindowEndConditionContext,
    WindowStartConditionContext,
    WindowVarsContext,
    ArgumentContext,
    type ModuleAndThisIsItContext,
    ArgumentListContext,
    SequenceTypeContext,
} from "./grammar/JsoniqParser.js";
import { JsoniqParserVisitor } from "./grammar/JsoniqParserVisitor.js";
import { parseFunctionName, parseQname, parseVarName } from "./name.js";

type AstVisitResult = AstNode[];

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

class JsoniqAstBuilder extends JsoniqParserVisitor<AstVisitResult> {
    public constructor(private readonly document: TextDocument) {
        super();
    }

    protected override defaultResult(): AstVisitResult {
        return [];
    }

    protected override aggregateResult(
        aggregate: AstVisitResult,
        nextResult: AstVisitResult,
    ): AstVisitResult {
        return aggregate.concat(nextResult);
    }

    public override visitModuleAndThisIsIt = (node: ModuleAndThisIsItContext): AstVisitResult => [
        {
            kind: "module",
            range: rangeFromNode(node, this.document),
            children: this.visitChildrenAsNodes(node),
        },
    ];

    public override visitLibraryModule = (node: LibraryModuleContext): AstVisitResult => {
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
                children: this.visitChildrenAsNodes(node),
            },
        ];
    };

    public override visitModuleImport = (node: ModuleImportContext): AstVisitResult => {
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

    public override visitNamespaceDecl = (node: NamespaceDeclContext): AstVisitResult => {
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

    public override visitContextItemDecl = (node: ContextItemDeclContext): AstVisitResult => [
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

    public override visitContextItemExpr = (node: ContextItemExprContext): AstVisitResult => [
        {
            kind: "context-item-expression",
            name: { kind: "unprefixed-qname", localName: "$" },
            range: rangeFromNode(node, this.document),
            children: [],
        },
    ];

    public override visitTypeDecl = (node: TypeDeclContext): AstVisitResult => {
        const nameNode = node.qname();
        if (nameNode === undefined) {
            return [];
        }

        return [
            {
                kind: "type-declaration",
                name: { qname: parseQname(nameNode) },
                range: rangeFromNode(node, this.document),
                selectionRange: rangeFromNode(nameNode, this.document),
                children: [],
            },
        ];
    };

    public override visitFunctionDecl = (node: FunctionDeclContext): AstVisitResult => [
        {
            kind: "function-declaration",
            range: rangeFromNode(node, this.document),
            name: parseFunctionName(node),
            selectionRange: rangeFromNode(node.functionName(), this.document),
            parameters: this.parameters(node),
            isPrivate: hasPrivateAnnotation(node),
            children: this.visitChildrenAsNodes(node),
        },
    ];

    private variableDeclaration(
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
            ...this.visitChildrenAsNodes(node),
        ];
    }

    private declarationWithChildren(
        node: ParseTree,
        declaration: VariableDeclarationAstNode | null,
    ): AstVisitResult {
        return declaration === null
            ? this.visitChildrenAsNodes(node)
            : [
                  {
                      ...declaration,
                      range: rangeFromNode(node, this.document),
                      children: this.visitChildrenAsNodes(node),
                  },
              ];
    }

    public override visitVarDecl = (node: VarDeclContext): AstVisitResult => {
        const terminator = node.SEMICOLON();
        const visibleFrom =
            terminator === null || terminator.symbol.tokenIndex < 0
                ? null
                : rangeFromNode(terminator, this.document).end;
        const declaration = this.variableDeclaration(node.varBinding(), visibleFrom);
        return this.declarationWithChildren(
            node,
            declaration === null ? null : { ...declaration, isPrivate: hasPrivateAnnotation(node) },
        );
    };

    public override visitForVar = (node: ForVarContext): AstVisitResult => {
        const expression = node._ex;
        const visibleFrom =
            expression === undefined ? null : rangeFromNode(expression, this.document).end;
        return this.declarationsBeforeChildren(node, [
            this.variableDeclaration(node._var_ref, visibleFrom),
            this.variableDeclaration(node._at, visibleFrom),
        ]);
    };

    public override visitPositionalVar = (node: PositionalVarContext): AstVisitResult => {
        const condition = node.parent?.parent;
        const expression =
            condition instanceof WindowStartConditionContext ||
            condition instanceof WindowEndConditionContext
                ? condition.exprSingle()
                : null;
        const visibleFrom =
            expression === null ? null : rangeFromNode(expression, this.document).start;
        return this.declarationsBeforeChildren(node, [
            this.variableDeclaration(node._pvar, visibleFrom),
        ]);
    };

    public override visitLetVar = (node: LetVarContext): AstVisitResult => {
        const expression = node._ex;
        const visibleFrom =
            expression === undefined ? null : rangeFromNode(expression, this.document).end;
        return this.declarationWithChildren(
            node,
            this.variableDeclaration(node._var_ref, visibleFrom),
        );
    };

    public override visitTumblingWindowClause = (
        node: TumblingWindowClauseContext,
    ): AstVisitResult =>
        this.declarationsBeforeChildren(node, [
            this.variableDeclaration(node._name, rangeFromNode(node, this.document).end),
        ]);

    public override visitSlidingWindowClause = (node: SlidingWindowClauseContext): AstVisitResult =>
        this.declarationsBeforeChildren(node, [
            this.variableDeclaration(node._name, rangeFromNode(node, this.document).end),
        ]);

    public override visitWindowVars = (node: WindowVarsContext): AstVisitResult => {
        const condition = node.parent;
        const expression =
            condition instanceof WindowStartConditionContext ||
            condition instanceof WindowEndConditionContext
                ? condition.exprSingle()
                : null;
        const visibleFrom =
            expression === null ? null : rangeFromNode(expression, this.document).start;
        return this.declarationsBeforeChildren(node, [
            this.variableDeclaration(node._currentItem, visibleFrom),
            this.variableDeclaration(node._previousItem, visibleFrom),
            this.variableDeclaration(node._nextItem, visibleFrom),
        ]);
    };

    public override visitCountClause = (node: CountClauseContext): AstVisitResult =>
        this.declarationsBeforeChildren(node, [
            this.variableDeclaration(node.varBinding(), rangeFromNode(node, this.document).end),
        ]);

    public override visitGroupByVar = (node: GroupByVarContext): AstVisitResult => {
        const clause = node.parent;
        const visibleFrom = clause === null ? null : rangeFromNode(clause, this.document).end;
        return this.declarationsBeforeChildren(node, [
            this.variableDeclaration(node._var_ref, visibleFrom),
        ]);
    };

    public override visitQuantifiedExprVar = (node: QuantifiedExprVarContext): AstVisitResult => {
        const expression = node.exprSingle();
        return this.declarationsBeforeChildren(node, [
            this.variableDeclaration(node._var_ref, rangeFromNode(expression, this.document).end),
        ]);
    };

    public override visitTypeswitchExpr = (node: TypeswitchExprContext): AstVisitResult =>
        this.declarationsBeforeChildren(node, [
            this.variableDeclaration(
                node._var_ref,
                node._def === undefined ? null : rangeFromNode(node._def, this.document).start,
            ),
        ]);

    public override visitCaseClause = (node: CaseClauseContext): AstVisitResult =>
        this.declarationsBeforeChildren(node, [
            this.variableDeclaration(
                node._var_ref,
                node._ret === undefined ? null : rangeFromNode(node._ret, this.document).start,
            ),
        ]);

    public override visitInlineFunctionExpr = (node: InlineFunctionExprContext): AstVisitResult => {
        const bodyStart = node.LBRACE();
        const visibleFrom = bodyStart === null ? null : rangeFromNode(bodyStart, this.document).end;
        const declarations =
            node
                .paramList()
                ?.param()
                .map((param) => this.variableDeclaration(param._name, visibleFrom)) ?? [];

        return this.declarationsBeforeChildren(node, declarations);
    };

    public override visitTypeSwitchStatement = (node: TypeSwitchStatementContext): AstVisitResult =>
        this.declarationsBeforeChildren(node, [
            this.variableDeclaration(
                node._var_ref,
                node._def === undefined ? null : rangeFromNode(node._def, this.document).start,
            ),
        ]);

    public override visitCaseStatement = (node: CaseStatementContext): AstVisitResult =>
        this.declarationsBeforeChildren(node, [
            this.variableDeclaration(
                node._var_ref,
                node._ret === undefined ? null : rangeFromNode(node._ret, this.document).start,
            ),
        ]);

    public override visitVarDeclForStatement = (
        node: VarDeclForStatementContext,
    ): AstVisitResult => {
        const statement = node.parent;
        const terminator =
            statement instanceof VarDeclStatementContext ? statement.SEMICOLON() : null;
        const visibleFrom =
            terminator === null || terminator.symbol.tokenIndex < 0
                ? null
                : rangeFromNode(terminator, this.document).end;
        return this.declarationsBeforeChildren(node, [
            this.variableDeclaration(node._var_ref, visibleFrom),
        ]);
    };

    public override visitCopyDecl = (node: CopyDeclContext): AstVisitResult => {
        const transform = node.parent;
        const modifyExpression =
            transform instanceof TransformExprContext ? transform._mod_expr : undefined;
        return this.declarationsBeforeChildren(node, [
            this.variableDeclaration(
                node._var_ref,
                modifyExpression === undefined
                    ? null
                    : rangeFromNode(modifyExpression, this.document).start,
            ),
        ]);
    };

    public override visitFlworExpr = (node: FlworExprContext): AstVisitResult => [
        {
            kind: "flowr-expression",
            range: rangeFromNode(node, this.document),
            children: this.visitChildrenAsNodes(node),
        },
    ];

    public override visitFlworStatement = (node: FlworStatementContext): AstVisitResult => [
        {
            kind: "flowr-expression",
            range: rangeFromNode(node, this.document),
            children: this.visitChildrenAsNodes(node),
        },
    ];

    public override visitVarRef = (node: VarRefContext): AstVisitResult => {
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

    public override visitFunctionCall = (node: FunctionCallContext): AstVisitResult =>
        this.functionCall(node);

    public override visitNamedFunctionRef = (node: NamedFunctionRefContext): AstVisitResult =>
        this.namedFunctionReference(node);

    public override visitCatchCaseStatement = (node: CatchCaseStatementContext): AstVisitResult =>
        this.catchClause(node);

    public override visitCatchClause = (node: CatchClauseContext): AstVisitResult =>
        this.catchClause(node);

    public override visitArgument = (node: ArgumentContext): AstVisitResult => [
        {
            kind: "argument",
            range: rangeFromNode(node, this.document),
            children: this.visitChildrenAsNodes(node),
            index:
                node.parent instanceof ArgumentListContext
                    ? node.parent.argument().indexOf(node)
                    : -1,
        },
    ];

    public override visitSequenceType = (node: SequenceTypeContext): AstVisitResult => {
        const item = node.itemType();
        const name = item?.eqName()?.qname();

        if (name === null || name === undefined) {
            return this.visitChildren(node) ?? [];
        }

        return [
            {
                kind: "type-reference",
                name: parseQname(name),
                children: this.visitChildrenAsNodes(node),
                range: rangeFromNode(node, this.document),
            },
        ];
    };

    private visitChildrenAsNodes(node: ParseTree): AstNode[] {
        return this.visitChildren(node) ?? [];
    }

    private parameters(node: FunctionDeclContext): AstParameter[] {
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

    private functionCall(node: FunctionCallContext): AstVisitResult {
        const nameNode = node._fn_name;
        const name = parseFunctionName(node);
        if (nameNode === undefined) {
            return [];
        }

        const children = this.visitChildrenAsNodes(node);

        return [
            {
                kind: "function-call",
                name,
                selectionRange: rangeFromNode(nameNode, this.document),
                range: rangeFromNode(node, this.document),
                children,
            },
        ];
    }

    private namedFunctionReference(node: NamedFunctionRefContext): AstVisitResult {
        const nameNode = node._fn_name;
        const name = parseFunctionName(node);
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
    }

    private catchClause(node: CatchCaseStatementContext | CatchClauseContext): AstVisitResult {
        const bodyStart =
            node instanceof CatchClauseContext ? node.LBRACE() : node._catch_block?.LBRACE();
        const explicitDeclaration =
            node instanceof CatchClauseContext
                ? this.variableDeclaration(
                      node._catch_var,
                      rangeFromNode(node.LBRACE(), this.document).end,
                  )
                : null;
        return [
            {
                kind: "catch-clause",
                range: rangeFromNode(node, this.document),
                bodyStart:
                    bodyStart === undefined
                        ? rangeFromNode(node, this.document).start
                        : rangeFromNode(bodyStart, this.document).end,
                children: [
                    ...(explicitDeclaration === null ? [] : [explicitDeclaration]),
                    ...this.visitChildrenAsNodes(node),
                ],
            },
        ];
    }
}

export function buildJsoniqAst(
    tree: ModuleAndThisIsItContext,
    document: TextDocument,
): ModuleAstNode {
    const ast = new JsoniqAstBuilder(document).visitModuleAndThisIsIt(tree)[0];
    if (ast === undefined || ast.kind !== "module") {
        throw new Error("Expected module AST root.");
    }
    return ast;
}
