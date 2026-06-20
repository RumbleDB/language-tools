import { Token, type ParseTree } from "antlr4ng";
import {
    type AstNode,
    type AstParameter,
    type AstBinding,
    type ContextItemDeclarationAstNode,
    type CountClauseAstNode,
    type ForBindingAstNode,
    type FunctionCallAstNode,
    type FunctionDeclarationAstNode,
    type GroupByBindingAstNode,
    type JsoniqAst,
    type LetBindingAstNode,
    type NamedFunctionReferenceAstNode,
    type NamespaceDeclarationAstNode,
    type VariableDeclarationAstNode,
    type ArgumentAstNode,
} from "server/parser/types/ast.js";
import { rangeFromNode } from "server/utils/range.js";
import { TextDocument } from "vscode-languageserver-textdocument";

import {
    CatchCaseStatementContext,
    CatchClauseContext,
    CaseClauseContext,
    CaseStatementContext,
    ContextItemDeclContext,
    ContextItemExprContext,
    CountClauseContext,
    CopyDeclContext,
    FlworExprContext,
    FlworStatementContext,
    ForVarContext,
    FunctionCallContext,
    FunctionDeclContext,
    GroupByVarContext,
    LetVarContext,
    NamedFunctionRefContext,
    NamespaceDeclContext,
    ParamContext,
    PositionalVarContext,
    QuantifiedExprVarContext,
    SlidingWindowClauseContext,
    TumblingWindowClauseContext,
    TypeSwitchStatementContext,
    TypeswitchExprContext,
    VarDeclContext,
    VarDeclForStatementContext,
    VarRefContext,
    WindowVarsContext,
    ArgumentContext,
    type ModuleAndThisIsItContext,
    ArgumentListContext,
    XQueryParser,
} from "./grammar/XQueryParser.js";
import { XQueryParserVisitor } from "./grammar/XQueryParserVisitor.js";
import { parseFunctionName, parseQname, parseVarName } from "./name.js";

type AstVisitResult = AstNode[];
type NextDefaultToken = (token: Token | null | undefined) => Token | null;

function unquoteStringLiteral(text: string): string {
    return text.length >= 2 &&
        ((text.startsWith('"') && text.endsWith('"')) ||
            (text.startsWith("'") && text.endsWith("'")))
        ? text.slice(1, -1)
        : text;
}

class XQueryAstBuilder extends XQueryParserVisitor<AstVisitResult> {
    public constructor(
        private readonly document: TextDocument,
        private readonly nextDefaultToken: NextDefaultToken,
    ) {
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
            } satisfies NamespaceDeclarationAstNode,
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
        } satisfies ContextItemDeclarationAstNode,
    ];

    public override visitContextItemExpr = (node: ContextItemExprContext): AstVisitResult => [
        {
            kind: "context-item-expression",
            name: { kind: "unprefixed-qname", localName: "$" },
            range: rangeFromNode(node, this.document),
            children: [],
        },
    ];

    // Note: type declaration is not supported in XQuery grammar
    // public override visitTypeDecl = (node: TypeDeclContext): AstVisitResult => {
    //     const nameNode = node.qname();
    //     if (nameNode === undefined) {
    //         return [];
    //     }

    //     return [
    //         {
    //             kind: "type-declaration",
    //             name: { qname: parseQname(nameNode) },
    //             range: rangeFromNode(node, this.document),
    //             selectionRange: rangeFromNode(nameNode, this.document),
    //             children: [],
    //         } satisfies TypeDeclarationAstNode,
    //     ];
    // };

    public override visitFunctionDecl = (node: FunctionDeclContext): AstVisitResult => [
        {
            kind: "function-declaration",
            range: rangeFromNode(node, this.document),
            name: parseFunctionName(node),
            nameRange: rangeFromNode(node.functionName(), this.document),
            parameters: this.parameters(node),
            children: this.visitChildrenAsNodes(node),
        } satisfies FunctionDeclarationAstNode,
    ];

    public override visitVarDecl = (node: VarDeclContext): AstVisitResult => {
        const binding = this.binding(node, node.varRef());

        return binding === null
            ? []
            : [
                  {
                      kind: "variable-declaration",
                      binding,
                      completed: this.nextDefaultToken(node.stop)?.type === XQueryParser.SEMICOLON,
                      range: rangeFromNode(node, this.document),
                      children: this.visitChildrenAsNodes(node),
                  } satisfies VariableDeclarationAstNode,
              ];
    };

    public override visitForVar = (node: ForVarContext): AstVisitResult => {
        const bindings: ForBindingAstNode["bindings"] = [];
        for (const [index, varRef] of [node._var_ref, node._at].entries()) {
            if (varRef === undefined) {
                continue;
            }

            const binding = this.binding(node, varRef);
            if (binding !== null) {
                bindings.push({
                    ...binding,
                    bindingKind: index === 0 ? "for" : "for-position",
                });
            }
        }

        return bindings.length === 0
            ? []
            : [
                  {
                      kind: "for-binding",
                      bindings,
                      range: rangeFromNode(node, this.document),
                      children: this.visitChildrenAsNodes(node),
                  } satisfies ForBindingAstNode,
              ];
    };

    public override visitLetVar = (node: LetVarContext): AstVisitResult => {
        const binding = this.binding(node, node._var_ref);
        return binding === null
            ? []
            : [
                  {
                      kind: "let-binding",
                      binding,
                      range: rangeFromNode(node, this.document),
                      children: this.visitChildrenAsNodes(node),
                  } satisfies LetBindingAstNode,
              ];
    };

    public override visitGroupByVar = (node: GroupByVarContext): AstVisitResult => {
        const binding = this.binding(node, node._var_ref);
        return binding === null
            ? []
            : [
                  {
                      kind: "group-by-binding",
                      binding,
                      range: rangeFromNode(node, this.document),
                      children: this.visitChildrenAsNodes(node),
                  } satisfies GroupByBindingAstNode,
              ];
    };

    public override visitCountClause = (node: CountClauseContext): AstVisitResult => {
        const binding = this.binding(node, node.varRef());
        return binding === null
            ? []
            : [
                  {
                      kind: "count-clause",
                      binding,
                      range: rangeFromNode(node, this.document),
                      children: this.visitChildrenAsNodes(node),
                  } satisfies CountClauseAstNode,
              ];
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
        if (this.isVariableDeclarationReference(node)) {
            return [];
        }

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
        } satisfies ArgumentAstNode,
    ];

    private visitChildrenAsNodes(node: ParseTree): AstNode[] {
        return this.visitChildren(node) ?? [];
    }

    private binding(
        declarationNode: ParseTree,
        varRef: VarRefContext | null | undefined,
    ): AstBinding | null {
        if (varRef === undefined || varRef === null) {
            return null;
        }

        const name = parseVarName(varRef);
        return name === null
            ? null
            : {
                  name,
                  range: rangeFromNode(declarationNode, this.document),
                  selectionRange: rangeFromNode(varRef, this.document),
              };
    }

    private parameters(node: FunctionDeclContext): AstParameter[] {
        const parameters: AstParameter[] = [];

        for (const [index, param] of node.paramList()?.param().entries() ?? []) {
            const nameNode = param._name;
            if (nameNode === undefined) {
                continue;
            }

            const paramName = parseQname(nameNode);
            if (paramName === null) {
                continue;
            }

            const dollarRange = rangeFromNode(param.DOLLAR(), this.document);
            const nameRange = rangeFromNode(nameNode, this.document);
            parameters.push({
                name: paramName,
                range: rangeFromNode(param, this.document),
                selectionRange: {
                    start: dollarRange.start,
                    end: nameRange.end,
                },
                index,
            });
        }

        return parameters;
    }

    private isVariableDeclarationReference(node: VarRefContext): boolean {
        return (
            node.parent instanceof ParamContext ||
            node.parent instanceof VarDeclContext ||
            node.parent instanceof ForVarContext ||
            node.parent instanceof PositionalVarContext ||
            node.parent instanceof LetVarContext ||
            node.parent instanceof GroupByVarContext ||
            node.parent instanceof CountClauseContext ||
            node.parent instanceof QuantifiedExprVarContext ||
            node.parent instanceof TypeswitchExprContext ||
            node.parent instanceof CaseClauseContext ||
            node.parent instanceof TumblingWindowClauseContext ||
            node.parent instanceof SlidingWindowClauseContext ||
            node.parent instanceof WindowVarsContext ||
            node.parent instanceof TypeSwitchStatementContext ||
            node.parent instanceof CaseStatementContext ||
            node.parent instanceof VarDeclForStatementContext ||
            node.parent instanceof CopyDeclContext
        );
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
                nameRange: rangeFromNode(nameNode, this.document),
                range: rangeFromNode(node, this.document),
                children,
            } satisfies FunctionCallAstNode,
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
                      nameRange: rangeFromNode(nameNode, this.document),
                      range: rangeFromNode(node, this.document),
                      children: [],
                  } satisfies NamedFunctionReferenceAstNode,
              ]
            : [];
    }

    private catchClause(node: CatchCaseStatementContext | CatchClauseContext): AstVisitResult {
        return [
            {
                kind: "catch-clause",
                range: rangeFromNode(node, this.document),
                children: this.visitChildrenAsNodes(node),
            },
        ];
    }
}

export function buildXQueryAst(
    tree: ModuleAndThisIsItContext,
    document: TextDocument,
    nextDefaultToken: NextDefaultToken,
): JsoniqAst {
    const ast = new XQueryAstBuilder(document, nextDefaultToken).visitModuleAndThisIsIt(tree)[0];
    if (ast === undefined || ast.kind !== "module") {
        throw new Error("Expected module AST root.");
    }
    return ast;
}
