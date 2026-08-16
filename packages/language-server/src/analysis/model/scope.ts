import { ScopeDefinition, ScopeDefinitionByReferenceKind } from "./definitions.js";
import { QName, QNameToString, type FunctionName, type ReferenceNameByKind } from "./names.js";

interface ScopeEntry {
    definition: ScopeDefinition;
    visibleFrom: number;
}

export interface Scope {
    readonly parent: Scope | undefined;
    readonly startOffset: number;
    readonly endOffset: number;
    resolve<K extends keyof ReferenceNameByKind>(
        kind: K,
        name: ReferenceNameByKind[K],
        offset: number,
        excludedDefinitions?: ReadonlySet<ScopeDefinition>,
    ): ScopeDefinitionByReferenceKind[K] | undefined;
    contains(offset: number): boolean;
    findInnermostScope(offset: number): Scope;
    listVisibleDefinitions(offset: number): Map<string, ScopeDefinition>;
}

export class ScopeBuilder implements Scope {
    private readonly entriesByName = new Map<string, ScopeEntry[]>();
    private readonly children: Scope[] = [];

    private constructor(
        public readonly parent: ScopeBuilder | undefined,
        public readonly startOffset: number,
        public readonly endOffset: number,
    ) {}

    public static module(documentLength: number): ScopeBuilder {
        return new ScopeBuilder(undefined, 0, documentLength);
    }

    public enter(startOffset: number, endOffset: number): ScopeBuilder {
        const child = new ScopeBuilder(this, startOffset, endOffset);
        this.children.push(child);
        return child;
    }

    public declare(definition: ScopeDefinition, visibleFrom: number): void {
        const name = this.definitionLookupKey(definition);
        if (!this.entriesByName.has(name)) {
            this.entriesByName.set(name, []);
        }

        this.entriesByName.get(name)!.push({ definition, visibleFrom });
    }

    public resolve<K extends keyof ReferenceNameByKind>(
        kind: K,
        name: ReferenceNameByKind[K],
        offset: number,
        excludedDefinitions: ReadonlySet<ScopeDefinition> = new Set(),
    ): ScopeDefinitionByReferenceKind[K] | undefined {
        const entries = this.entriesByName.get(this.referenceLookupKey(name, kind));
        const entry = entries?.findLast(
            (candidate) =>
                candidate.visibleFrom <= offset && !excludedDefinitions.has(candidate.definition),
        );
        if (entry !== undefined) {
            // Definitions and references use the same kind-prefixed lookup keys, so a
            // successful lookup has the definition type associated with K.
            return entry.definition as ScopeDefinitionByReferenceKind[K];
        }

        return this.parent?.resolve(kind, name, offset, excludedDefinitions);
    }

    /**
     * Checks if the given offset is within the range of this scope.
     */
    public contains(offset: number): boolean {
        return offset >= this.startOffset && offset <= this.endOffset;
    }

    public findInnermostScope(offset: number): Scope {
        for (const child of this.children) {
            if (child.contains(offset)) {
                /// We can return early because we know that scopes cannot overlap, only nest.
                return child.findInnermostScope(offset);
            }
        }

        return this;
    }

    /**
     * Lists all definitions that are visible at the given offset,
     * i.e. all definitions declared in this scope or any parent scope that are visible at the given offset.
     *
     * This method should be called on the innermost scope at the given offset
     */
    public listVisibleDefinitions(offset: number): Map<string, ScopeDefinition> {
        const visible = new Map<string, ScopeDefinition>();

        for (const [name, entries] of this.entriesByName.entries()) {
            const entry = entries.findLast((candidate) => candidate.visibleFrom <= offset);
            if (entry !== undefined) {
                visible.set(name, entry.definition);
            }
        }

        let current = this.parent;
        while (current !== undefined) {
            for (const [name, entries] of current.entriesByName.entries()) {
                if (visible.has(name)) {
                    continue;
                }

                const entry = entries.findLast((candidate) => candidate.visibleFrom <= offset);

                if (entry !== undefined) {
                    visible.set(name, entry.definition);
                }
            }

            current = current.parent;
        }

        return visible;
    }

    private functionLookupKey(name: FunctionName): string {
        return `${QNameToString(name.qname, true)}#${name.arity ?? "?"}`;
    }

    private definitionLookupKey(definition: ScopeDefinition): string {
        switch (definition.kind) {
            case "function":
                return `function:${this.functionLookupKey(definition.name)}`;
            case "type":
                return `type:${QNameToString(definition.name, true)}`;
            case "parameter":
            case "variable":
                return `variable:${QNameToString(definition.name, true)}`;
            default:
                throw definition satisfies never;
        }
    }

    private referenceLookupKey<K extends keyof ReferenceNameByKind>(
        name: ReferenceNameByKind[K],
        kind: K,
    ): string {
        switch (kind) {
            case "function":
                return `function:${this.functionLookupKey(name as FunctionName)}`;
            case "variable":
                return `variable:${QNameToString(name as QName, true)}`;
            case "type":
                return `type:${QNameToString(name as QName, true)}`;
            default:
                throw kind satisfies never;
        }
    }
}
