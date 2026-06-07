import { parseDocument } from "server/parser/index.js";
import type { AstNode } from "server/parser/types/ast.js";
import { lexicalQNameToString, varNameToString } from "server/parser/types/name.js";
import { comparePositions } from "server/utils/position.js";
import { DocumentSymbol, SymbolKind, type Range } from "vscode-languageserver";
import { TextDocument } from "vscode-languageserver-textdocument";

interface SymbolOwner {
    range: Range;
    symbol: DocumentSymbol;
}

export class DocumentSymbolsBuilder {
    private readonly symbols: DocumentSymbol[] = [];
    private readonly owners: SymbolOwner[] = [];

    public constructor(private readonly document: TextDocument) {}

    public build(): DocumentSymbol[] {
        this.visitNode(parseDocument(this.document).ast);
        return this.symbols;
    }

    private visitNode(node: AstNode): void {
        switch (node.kind) {
            case "module":
            case "flowr-expression":
            case "unknown":
            case "catch-clause":
                this.visitChildren(node);
                break;
            case "namespace-declaration":
                this.addSymbol(node.prefix, SymbolKind.Namespace, node.range, node.selectionRange);
                break;
            case "context-item-declaration":
                this.addSymbol(
                    varNameToString(node.name),
                    SymbolKind.Variable,
                    node.range,
                    node.selectionRange,
                    true,
                );
                break;
            case "type-declaration":
                this.addSymbol(
                    lexicalQNameToString(node.name.qname),
                    SymbolKind.Struct,
                    node.range,
                    node.selectionRange,
                );
                break;
            case "function-declaration": {
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
                break;
            }
            case "variable-declaration":
                this.addSymbol(
                    varNameToString(node.binding.name),
                    SymbolKind.Variable,
                    node.binding.range,
                    node.binding.selectionRange,
                    true,
                );
                this.visitChildren(node);
                break;
            case "let-binding":
            case "group-by-binding":
                this.addSymbol(
                    varNameToString(node.binding.name),
                    SymbolKind.Variable,
                    node.binding.range,
                    node.binding.selectionRange,
                    true,
                );
                this.visitChildren(node);
                break;
            case "count-clause":
                this.addSymbol(
                    varNameToString(node.binding.name),
                    SymbolKind.Variable,
                    node.binding.range,
                    node.binding.selectionRange,
                );
                this.visitChildren(node);
                break;
            case "for-binding":
                for (const binding of node.bindings) {
                    this.addSymbol(
                        varNameToString(binding.name),
                        SymbolKind.Variable,
                        binding.range,
                        binding.selectionRange,
                    );
                }
                this.visitChildren(node);
                break;
            case "function-call":
            case "named-function-reference":
            case "variable-reference":
            case "context-item-expression":
            case "reference":
                break;
            case "argument":
                this.visitChildren(node);
                break;
            default:
                throw node satisfies never;
        }
    }

    private visitChildren(node: AstNode): void {
        for (const child of node.children) {
            this.visitNode(child);
        }
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
