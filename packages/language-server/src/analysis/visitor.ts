import type {
    ArgumentNode,
    AnyReferenceNode,
    AstNode,
    DeclarationNode,
    ErrorCodeTargetNode,
    FunctionCallNode,
    ModuleNode,
} from "./ast.js";

export abstract class AstVisitor<R = void> {
    public visit(node: AstNode): R {
        switch (node.kind) {
            case "module":
                return this.visitModule(node);
            case "declaration":
                return this.visitDeclaration(node);
            case "reference":
                return this.visitReference(node);
            case "error-code-target":
                return this.visitErrorCodeTarget(node);
            case "function-call":
                return this.visitFunctionCall(node);
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

    protected visitModule(node: ModuleNode): R {
        return this.defaultVisit(node);
    }

    protected visitDeclaration(node: DeclarationNode): R {
        return this.defaultVisit(node);
    }

    protected visitReference(node: AnyReferenceNode): R {
        return this.defaultVisit(node);
    }

    protected visitErrorCodeTarget(node: ErrorCodeTargetNode): R {
        return this.defaultVisit(node);
    }

    protected visitFunctionCall(node: FunctionCallNode): R {
        return this.defaultVisit(node);
    }

    protected visitArgument(node: ArgumentNode): R {
        return this.defaultVisit(node);
    }
}
