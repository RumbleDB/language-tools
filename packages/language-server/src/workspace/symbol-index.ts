import type { DocumentUri } from "vscode-languageserver";

import type { SourceDefinition, SymbolId } from "../analysis/definitions.js";
import type { AnyResolvedReference } from "../analysis/reference.js";
import type { AnalysisResult } from "../analysis/result.js";

/** Maintains cross-document reference lookup independently from analysis caches. */
export class WorkspaceSymbolIndex {
    /**
     * A map of symbol IDs to the references that point to them. This is used to find all references to a symbol across the workspace.
     */
    private readonly referencesBySymbol = new Map<SymbolId, AnyResolvedReference[]>();

    /**
     * A set of symbol IDs that are defined in each document. This is used to remove references when a document is removed from the workspace.
     */
    private readonly symbolsByDocument = new Map<DocumentUri, Set<SymbolId>>();

    /**
     * Update the index with the references from a document's analysis result. This will replace any existing references for the document.
     * @param uri uri of the document
     * @param analysis analysis result of the document
     */
    public update(uri: DocumentUri, analysis: AnalysisResult): void {
        this.remove(uri);
        const symbols = new Set<SymbolId>();
        for (const reference of analysis.references) {
            if (reference.declaration.origin !== "source") continue;

            const symbolId = reference.declaration.id;
            const references = this.referencesBySymbol.get(symbolId) ?? [];
            references.push(reference);
            this.referencesBySymbol.set(symbolId, references);

            symbols.add(symbolId);
        }

        this.symbolsByDocument.set(uri, symbols);
    }

    /**
     * Remove all references from the index that are associated with a document. This is used when a document is removed from the workspace or its analysis is invalidated.
     * @param uri uri of the document
     */
    public remove(uri: DocumentUri): void {
        for (const symbolId of this.symbolsByDocument.get(uri) ?? []) {
            const remaining = (this.referencesBySymbol.get(symbolId) ?? []).filter(
                (reference) => reference.uri !== uri,
            );
            if (remaining.length === 0) this.referencesBySymbol.delete(symbolId);
            else this.referencesBySymbol.set(symbolId, remaining);
        }
        this.symbolsByDocument.delete(uri);
    }

    /**
     * Get all references to a symbol across the workspace.
     * @param definition the symbol definition
     * @returns the list of references
     */
    public referencesTo(definition: SourceDefinition): readonly AnyResolvedReference[] {
        return this.referencesBySymbol.get(definition.id) ?? [];
    }
}
