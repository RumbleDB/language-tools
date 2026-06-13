import type {
    ArgumentAstNode,
    AstNode,
    CatchClauseAstNode,
    ContextItemDeclarationAstNode,
    ContextItemExpressionAstNode,
    CountClauseAstNode,
    FlowrExpressionAstNode,
    ForBindingAstNode,
    FunctionCallAstNode,
    FunctionDeclarationAstNode,
    GroupByBindingAstNode,
    LetBindingAstNode,
    ModuleAstNode,
    NamedFunctionReferenceAstNode,
    NamespaceDeclarationAstNode,
    TypeDeclarationAstNode,
    VariableDeclarationAstNode,
    VariableReferenceAstNode,
} from "./ast.js";

export abstract class ParserAstVisitor<R = void> {
    public visit(node: AstNode): R {
        switch (node.kind) {
            case "module":
                return this.visitModule(node);
            case "namespace-declaration":
                return this.visitNamespaceDeclaration(node);
            case "context-item-declaration":
                return this.visitContextItemDeclaration(node);
            case "type-declaration":
                return this.visitTypeDeclaration(node);
            case "function-declaration":
                return this.visitFunctionDeclaration(node);
            case "variable-declaration":
                return this.visitVariableDeclaration(node);
            case "for-binding":
                return this.visitForBinding(node);
            case "let-binding":
                return this.visitLetBinding(node);
            case "group-by-binding":
                return this.visitGroupByBinding(node);
            case "count-clause":
                return this.visitCountClause(node);
            case "flowr-expression":
                return this.visitFlowrExpression(node);
            case "catch-clause":
                return this.visitCatchClause(node);
            case "function-call":
                return this.visitFunctionCall(node);
            case "named-function-reference":
                return this.visitNamedFunctionReference(node);
            case "variable-reference":
                return this.visitVariableReference(node);
            case "context-item-expression":
                return this.visitContextItemExpression(node);
            case "argument":
                return this.visitArgument(node);
            default:
                throw node satisfies never;
        }
    }

    protected visitChildren(node: AstNode): R[] {
        return node.children.map((child) => this.visit(child));
    }

    protected defaultVisit(node: AstNode): R {
        this.visitChildren(node);
        return undefined as R;
    }

    protected visitModule(node: ModuleAstNode): R {
        return this.defaultVisit(node);
    }

    protected visitNamespaceDeclaration(node: NamespaceDeclarationAstNode): R {
        return this.defaultVisit(node);
    }

    protected visitContextItemDeclaration(node: ContextItemDeclarationAstNode): R {
        return this.defaultVisit(node);
    }

    protected visitTypeDeclaration(node: TypeDeclarationAstNode): R {
        return this.defaultVisit(node);
    }

    protected visitFunctionDeclaration(node: FunctionDeclarationAstNode): R {
        return this.defaultVisit(node);
    }

    protected visitVariableDeclaration(node: VariableDeclarationAstNode): R {
        return this.defaultVisit(node);
    }

    protected visitForBinding(node: ForBindingAstNode): R {
        return this.defaultVisit(node);
    }

    protected visitLetBinding(node: LetBindingAstNode): R {
        return this.defaultVisit(node);
    }

    protected visitGroupByBinding(node: GroupByBindingAstNode): R {
        return this.defaultVisit(node);
    }

    protected visitCountClause(node: CountClauseAstNode): R {
        return this.defaultVisit(node);
    }

    protected visitFlowrExpression(node: FlowrExpressionAstNode): R {
        return this.defaultVisit(node);
    }

    protected visitCatchClause(node: CatchClauseAstNode): R {
        return this.defaultVisit(node);
    }

    protected visitFunctionCall(node: FunctionCallAstNode): R {
        return this.defaultVisit(node);
    }

    protected visitNamedFunctionReference(node: NamedFunctionReferenceAstNode): R {
        return this.defaultVisit(node);
    }

    protected visitVariableReference(node: VariableReferenceAstNode): R {
        return this.defaultVisit(node);
    }

    protected visitContextItemExpression(node: ContextItemExpressionAstNode): R {
        return this.defaultVisit(node);
    }

    protected visitArgument(node: ArgumentAstNode): R {
        return this.defaultVisit(node);
    }
}
