import type { ParseTree } from "antlr4ng";
import {
    attachParents,
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
    type TypeDeclarationAstNode,
    type VariableDeclarationAstNode,
    type ArgumentAstNode,
} from "server/parser/types/ast.js";
import { rangeFromNode } from "server/utils/range.js";
import { TextDocument } from "vscode-languageserver-textdocument";

import {
    CatchCaseStatementContext,
    CatchClauseContext,
    ContextItemDeclContext,
    ContextItemExprContext,
    CountClauseContext,
    DeclaredVarRefContext,
    FlowrExprContext,
    FlowrStatementContext,
    ForVarContext,
    FunctionCallContext,
    FunctionDeclContext,
    GroupByVarContext,
    LetVarContext,
    NamedFunctionRefContext,
    NamespaceDeclContext,
    TypeDeclContext,
    VarDeclContext,
    VarRefContext,
    ArgumentContext,
    type ModuleAndThisIsItContext,
    ArgumentListContext,
} from "./grammar/jsoniqParser.js";
import { jsoniqVisitor } from "./grammar/jsoniqVisitor.js";
import { parseFunctionName, parseQname, parseVarName } from "./name.js";

type AstVisitResult = AstNode[];

function unquoteStringLiteral(text: string): string {
    return text.length >= 2 &&
        ((text.startsWith('"') && text.endsWith('"')) ||
            (text.startsWith("'") && text.endsWith("'")))
        ? text.slice(1, -1)
        : text;
}

class JsoniqAstBuilder extends jsoniqVisitor<AstVisitResult> {
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

    public override visitNamespaceDecl = (node: NamespaceDeclContext): AstVisitResult => {
        const nameNode = node.NCName();
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
                start: rangeFromNode(node.Kcontext(), this.document).start,
                end: rangeFromNode(node.Kitem(), this.document).end,
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

    public override visitTypeDecl = (node: TypeDeclContext): AstVisitResult => {
        const nameNode = node.declaredQName().qname();
        return [
            {
                kind: "type-declaration",
                name: { qname: parseQname(nameNode) },
                range: rangeFromNode(node, this.document),
                selectionRange: rangeFromNode(nameNode, this.document),
                children: [],
            } satisfies TypeDeclarationAstNode,
        ];
    };

    public override visitFunctionDecl = (node: FunctionDeclContext): AstVisitResult => [
        {
            kind: "function-declaration",
            range: rangeFromNode(node, this.document),
            name: parseFunctionName(node),
            nameRange: rangeFromNode(node.declaredQName(), this.document),
            parameters: this.parameters(node),
            children: this.visitChildrenAsNodes(node),
        } satisfies FunctionDeclarationAstNode,
    ];

    public override visitVarDecl = (node: VarDeclContext): AstVisitResult => {
        const binding = this.binding(node, node.declaredVarRef());
        const semicolon = node.Ksemicolon();

        return binding === null
            ? []
            : [
                  {
                      kind: "variable-declaration",
                      binding,
                      completed: semicolon !== null && semicolon.symbol.start >= 0,
                      range: rangeFromNode(node, this.document),
                      children: this.visitChildrenAsNodes(node),
                  } satisfies VariableDeclarationAstNode,
              ];
    };

    public override visitForVar = (node: ForVarContext): AstVisitResult => {
        const bindings: ForBindingAstNode["bindings"] = [];
        for (const [index, declaredVarRef] of node.declaredVarRef().entries()) {
            const binding = this.binding(node, declaredVarRef);
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
        const binding = this.binding(node, node.declaredVarRef());
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
        const binding = this.binding(node, node.declaredVarRef());
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
        const binding = this.binding(node, node.declaredVarRef());
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

    public override visitFlowrExpr = (node: FlowrExprContext): AstVisitResult => [
        {
            kind: "flowr-expression",
            range: rangeFromNode(node, this.document),
            children: this.visitChildrenAsNodes(node),
        },
    ];

    public override visitFlowrStatement = (node: FlowrStatementContext): AstVisitResult => [
        {
            kind: "flowr-expression",
            range: rangeFromNode(node, this.document),
            children: this.visitChildrenAsNodes(node),
        },
    ];

    public override visitVarRef = (node: VarRefContext): AstVisitResult => {
        if (node.parent instanceof DeclaredVarRefContext) {
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
        declaredVarRef: DeclaredVarRefContext,
    ): AstBinding | null {
        const name = parseVarName(declaredVarRef.varRef());
        return name === null
            ? null
            : {
                  name,
                  range: rangeFromNode(declarationNode, this.document),
                  selectionRange: rangeFromNode(declaredVarRef.varRef(), this.document),
              };
    }

    private parameters(node: FunctionDeclContext): AstParameter[] {
        const parameters: AstParameter[] = [];

        for (const [index, param] of node.paramList()?.param().entries() ?? []) {
            const paramName = parseVarName(param.declaredVarRef().varRef());
            if (paramName === null) {
                continue;
            }

            parameters.push({
                name: paramName,
                range: rangeFromNode(param, this.document),
                selectionRange: rangeFromNode(param.declaredVarRef(), this.document),
                index,
            });
        }

        return parameters;
    }

    private functionCall(node: FunctionCallContext): AstVisitResult {
        const nameNode = node.qname();
        const name = parseFunctionName(node);
        return name !== null && nameNode !== null
            ? [
                  {
                      kind: "function-call",
                      name,
                      nameRange: rangeFromNode(nameNode, this.document),
                      range: rangeFromNode(node, this.document),
                      children: this.visitChildrenAsNodes(node),
                  } satisfies FunctionCallAstNode,
              ]
            : [];
    }

    private namedFunctionReference(node: NamedFunctionRefContext): AstVisitResult {
        const nameNode = node.qname();
        const name = parseFunctionName(node);
        return name !== null && nameNode !== null
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

export function buildJsoniqAst(tree: ModuleAndThisIsItContext, document: TextDocument): JsoniqAst {
    const ast = new JsoniqAstBuilder(document).visitModuleAndThisIsIt(tree)[0];
    if (ast === undefined || ast.kind !== "module") {
        throw new Error("Expected module AST root.");
    }
    return attachParents(ast);
}
