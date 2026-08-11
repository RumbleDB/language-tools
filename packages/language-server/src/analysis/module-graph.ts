import type { DocumentUri } from "vscode-languageserver";

/** Owns resolved module dependency edges independently from analysis traversal. */
export class ModuleGraph {
    private readonly dependencies = new Map<DocumentUri, ReadonlySet<DocumentUri>>();
    private readonly dependents = new Map<DocumentUri, Set<DocumentUri>>();

    public replaceDependencies(
        importer: DocumentUri,
        dependencies: ReadonlySet<DocumentUri>,
    ): void {
        for (const previous of this.dependencies.get(importer) ?? []) {
            this.dependents.get(previous)?.delete(importer);
        }

        this.dependencies.set(importer, new Set(dependencies));
        for (const dependency of dependencies) {
            const dependents = this.dependents.get(dependency) ?? new Set<DocumentUri>();
            dependents.add(importer);
            this.dependents.set(dependency, dependents);
        }
    }

    public removeDocument(uri: DocumentUri): void {
        this.replaceDependencies(uri, new Set());
        this.dependencies.delete(uri);
    }

    public affectedBy(changedDocuments: readonly DocumentUri[]): ReadonlySet<DocumentUri> {
        const affected = new Set(changedDocuments);
        const pending = [...changedDocuments];
        while (pending.length > 0) {
            const dependency = pending.pop()!;
            for (const dependent of this.dependents.get(dependency) ?? []) {
                if (affected.has(dependent)) continue;
                affected.add(dependent);
                pending.push(dependent);
            }
        }
        return affected;
    }
}
