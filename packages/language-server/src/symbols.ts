import { DocumentSymbol, SymbolKind } from "vscode-languageserver";
import { TextDocument } from "vscode-languageserver-textdocument";

import { AstNode, DeclarationNode } from "./analysis/ast.js";
import { definitionNameToString } from "./analysis/definitions.js";
import { QNameToString } from "./analysis/names.js";
import { getAnalysis } from "./analysis/service.js";
import { AstVisitor } from "./analysis/visitor.js";

/**
 * Collects DocumentSymbols from the given TextDocument.
 */
export async function collectDocumentSymbols(document: TextDocument): Promise<DocumentSymbol[]> {
    return new DocumentSymbolsBuilder(document).build();
}

export class DocumentSymbolsBuilder extends AstVisitor<DocumentSymbol[]> {
    private readonly document: TextDocument;

    public constructor(document: TextDocument) {
        super();
        this.document = document;
    }

    public build(): DocumentSymbol[] {
        const analysis = getAnalysis(this.document);
        return this.visit(analysis.ast);
    }

    protected override defaultVisit(node: AstNode): DocumentSymbol[] {
        return this.visitChildren(node).flat();
    }

    protected override visitDeclaration(node: DeclarationNode): DocumentSymbol[] {
        const declaration = node.declaration;
        const name =
            declaration.kind === "function"
                ? QNameToString(declaration.name.qname, false)
                : definitionNameToString(declaration, false);

        if (name.trim() === "" || name === "$") {
            return this.visitChildren(node).flat();
        }

        let kind: SymbolKind;

        switch (declaration.kind) {
            case "namespace":
                kind = SymbolKind.Namespace;
                break;
            case "type":
                kind = SymbolKind.Struct;
                break;
            case "function":
                kind = SymbolKind.Function;
                break;
            default: // all variable kinds, parameters, etc.
                kind = SymbolKind.Variable;
                break;
        }

        const childSymbols = this.visitChildren(node).flat();

        const symbol: DocumentSymbol = {
            name,
            kind,
            range: declaration.range,
            selectionRange: declaration.selectionRange,
            children: childSymbols,
        };

        return [symbol];
    }
}
