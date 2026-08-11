import type { DocumentUri } from "vscode-languageserver";

import type { AnalysisResult } from "./builder.js";
import type { SourceDefinition, SymbolId } from "./definitions.js";
import type { AnyResolvedReference } from "./reference.js";

/** Maintains cross-document reference lookup independently from analysis caches. */
export class WorkspaceSymbolIndex {
    /** References grouped by the stable ID of their source declaration. */
    private readonly referencesBySymbol = new Map<SymbolId, AnyResolvedReference[]>();

    /** Source declaration IDs contributed by each indexed document. */
    private readonly symbolsByDocument = new Map<DocumentUri, Set<SymbolId>>();

    /** Replaces the references contributed by one analysed document. */
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

    /** Removes every reference contributed by a document. */
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

    /** Returns all workspace references that resolve to a source declaration. */
    public referencesTo(definition: SourceDefinition): readonly AnyResolvedReference[] {
        return this.referencesBySymbol.get(definition.id) ?? [];
    }
}
