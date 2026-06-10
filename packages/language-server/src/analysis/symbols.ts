import { parseDocument } from "server/parser/index.js";
import type {
    ContextItemDeclarationAstNode,
    CountClauseAstNode,
    ForBindingAstNode,
    FunctionDeclarationAstNode,
    GroupByBindingAstNode,
    LetBindingAstNode,
    NamespaceDeclarationAstNode,
    TypeDeclarationAstNode,
    VariableDeclarationAstNode,
} from "server/parser/types/ast.js";
import { lexicalQNameToString, varNameToString } from "server/parser/types/name.js";
import { AstVisitor } from "server/parser/types/visitor.js";
import { comparePositions } from "server/utils/position.js";
import { DocumentSymbol, SymbolKind, type Range } from "vscode-languageserver";
import { TextDocument } from "vscode-languageserver-textdocument";

interface SymbolOwner {
    range: Range;
    symbol: DocumentSymbol;
}

export class DocumentSymbolsBuilder extends AstVisitor<void> {
    private readonly symbols: DocumentSymbol[] = [];
    private readonly owners: SymbolOwner[] = [];

    private readonly document: TextDocument;

    public constructor(document: TextDocument) {
        super();
        this.document = document;
    }

    public build(): DocumentSymbol[] {
        this.visit(parseDocument(this.document).ast);
        return this.symbols;
    }

    protected override visitNamespaceDeclaration(node: NamespaceDeclarationAstNode): void {
        this.addSymbol(node.prefix, SymbolKind.Namespace, node.range, node.selectionRange);
    }

    protected override visitContextItemDeclaration(node: ContextItemDeclarationAstNode): void {
        this.addSymbol(
            varNameToString(node.name),
            SymbolKind.Variable,
            node.range,
            node.selectionRange,
            true,
        );
    }

    protected override visitTypeDeclaration(node: TypeDeclarationAstNode): void {
        this.addSymbol(
            lexicalQNameToString(node.name.qname),
            SymbolKind.Struct,
            node.range,
            node.selectionRange,
        );
    }

    protected override visitFunctionDeclaration(node: FunctionDeclarationAstNode): void {
        this.addSymbol(
            lexicalQNameToString(node.name.qname),
            SymbolKind.Function,
            node.range,
            node.nameRange,
            true,
        );
        for (const parameter of node.parameters) {
            this.addSymbol(
                varNameToString(parameter.name),
                SymbolKind.Variable,
                parameter.range,
                parameter.selectionRange,
            );
        }
        this.visitChildren(node);
    }

    protected override visitVariableDeclaration(node: VariableDeclarationAstNode): void {
        this.addSymbol(
            varNameToString(node.binding.name),
            SymbolKind.Variable,
            node.binding.range,
            node.binding.selectionRange,
            true,
        );
        this.visitChildren(node);
    }

    protected override visitLetBinding(node: LetBindingAstNode): void {
        this.visitVariableBinding(node);
    }

    protected override visitGroupByBinding(node: GroupByBindingAstNode): void {
        this.visitVariableBinding(node);
    }

    protected override visitCountClause(node: CountClauseAstNode): void {
        this.addSymbol(
            varNameToString(node.binding.name),
            SymbolKind.Variable,
            node.binding.range,
            node.binding.selectionRange,
        );
        this.visitChildren(node);
    }

    protected override visitForBinding(node: ForBindingAstNode): void {
        for (const binding of node.bindings) {
            this.addSymbol(
                varNameToString(binding.name),
                SymbolKind.Variable,
                binding.range,
                binding.selectionRange,
            );
        }
        this.visitChildren(node);
    }

    private visitVariableBinding(node: LetBindingAstNode | GroupByBindingAstNode): void {
        this.addSymbol(
            varNameToString(node.binding.name),
            SymbolKind.Variable,
            node.binding.range,
            node.binding.selectionRange,
            true,
        );
        this.visitChildren(node);
    }

    private addSymbol(
        name: string,
        kind: SymbolKind,
        range: Range,
        selectionRange: Range,
        canContainChildren = false,
    ): void {
        if (name.trim() === "") {
            return;
        }

        this.leaveCompletedOwners(range);

        const symbol: DocumentSymbol = {
            name,
            kind,
            range,
            selectionRange,
            children: [],
        };

        const parent = this.currentOwner()?.symbol;
        if (parent === undefined) {
            this.symbols.push(symbol);
        } else {
            parent.children ??= [];
            parent.children.push(symbol);
        }

        if (canContainChildren) {
            this.owners.push({ range, symbol });
        }
    }

    private leaveCompletedOwners(range: Range): void {
        while (!this.currentOwnerContains(range)) {
            this.owners.pop();
        }
    }

    private currentOwner(): SymbolOwner | undefined {
        return this.owners[this.owners.length - 1];
    }

    private currentOwnerContains(range: Range): boolean {
        const owner = this.currentOwner();
        if (owner === undefined) {
            return true;
        }

        return (
            comparePositions(owner.range.start, range.start) <= 0 &&
            comparePositions(range.end, owner.range.end) <= 0
        );
    }
}
