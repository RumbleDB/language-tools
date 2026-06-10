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
    ReferenceAstNode,
    TypeDeclarationAstNode,
    UnknownAstNode,
    VariableDeclarationAstNode,
    VariableReferenceAstNode,
} from "./ast.js";

export abstract class AstVisitor {
    public visit(node: AstNode): void {
        switch (node.kind) {
            case "module":
                this.visitModule(node);
                break;
            case "namespace-declaration":
                this.visitNamespaceDeclaration(node);
                break;
            case "context-item-declaration":
                this.visitContextItemDeclaration(node);
                break;
            case "type-declaration":
                this.visitTypeDeclaration(node);
                break;
            case "function-declaration":
                this.visitFunctionDeclaration(node);
                break;
            case "variable-declaration":
                this.visitVariableDeclaration(node);
                break;
            case "for-binding":
                this.visitForBinding(node);
                break;
            case "let-binding":
                this.visitLetBinding(node);
                break;
            case "group-by-binding":
                this.visitGroupByBinding(node);
                break;
            case "count-clause":
                this.visitCountClause(node);
                break;
            case "flowr-expression":
                this.visitFlowrExpression(node);
                break;
            case "catch-clause":
                this.visitCatchClause(node);
                break;
            case "reference":
                this.visitReference(node);
                break;
            case "function-call":
                this.visitFunctionCall(node);
                break;
            case "named-function-reference":
                this.visitNamedFunctionReference(node);
                break;
            case "variable-reference":
                this.visitVariableReference(node);
                break;
            case "context-item-expression":
                this.visitContextItemExpression(node);
                break;
            case "argument":
                this.visitArgument(node);
                break;
            case "unknown":
                this.visitUnknown(node);
                break;
            default:
                throw node satisfies never;
        }
    }

    protected visitChildren(node: AstNode): void {
        for (const child of node.children) {
            this.visit(child);
        }
    }

    protected visitModule(node: ModuleAstNode): void {
        this.visitChildren(node);
    }

    protected visitNamespaceDeclaration(node: NamespaceDeclarationAstNode): void {
        this.visitChildren(node);
    }

    protected visitContextItemDeclaration(node: ContextItemDeclarationAstNode): void {
        this.visitChildren(node);
    }

    protected visitTypeDeclaration(node: TypeDeclarationAstNode): void {
        this.visitChildren(node);
    }

    protected visitFunctionDeclaration(node: FunctionDeclarationAstNode): void {
        this.visitChildren(node);
    }

    protected visitVariableDeclaration(node: VariableDeclarationAstNode): void {
        this.visitChildren(node);
    }

    protected visitForBinding(node: ForBindingAstNode): void {
        this.visitChildren(node);
    }

    protected visitLetBinding(node: LetBindingAstNode): void {
        this.visitChildren(node);
    }

    protected visitGroupByBinding(node: GroupByBindingAstNode): void {
        this.visitChildren(node);
    }

    protected visitCountClause(node: CountClauseAstNode): void {
        this.visitChildren(node);
    }

    protected visitFlowrExpression(node: FlowrExpressionAstNode): void {
        this.visitChildren(node);
    }

    protected visitCatchClause(node: CatchClauseAstNode): void {
        this.visitChildren(node);
    }

    protected visitReference(node: ReferenceAstNode): void {
        this.visitChildren(node);
    }

    protected visitFunctionCall(node: FunctionCallAstNode): void {
        this.visitChildren(node);
    }

    protected visitNamedFunctionReference(node: NamedFunctionReferenceAstNode): void {
        this.visitChildren(node);
    }

    protected visitVariableReference(node: VariableReferenceAstNode): void {
        this.visitChildren(node);
    }

    protected visitContextItemExpression(node: ContextItemExpressionAstNode): void {
        this.visitChildren(node);
    }

    protected visitArgument(node: ArgumentAstNode): void {
        this.visitChildren(node);
    }

    protected visitUnknown(node: UnknownAstNode): void {
        this.visitChildren(node);
    }
}
