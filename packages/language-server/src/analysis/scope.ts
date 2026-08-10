import { type Prefix } from "server/parser/types/name.js";
import { getDocumentText } from "server/parser/utils.js";
import { TextDocument } from "vscode-languageserver-textdocument";

import {
    BaseDefinition,
    NamespaceDefinition,
    ScopeDefinition,
    ScopeDefinitionByReferenceKind,
} from "./definitions.js";
import { QName, QNameToString, type FunctionName, type ReferenceNameByKind } from "./names.js";

export class Scope {
    private readonly definitionByName = new Map<string, ScopeDefinition[]>();
    private readonly children: Scope[] = [];

    private constructor(
        public readonly parent: Scope | undefined,
        public readonly startOffset: number,
        public readonly endOffset: number,
        private readonly namespaces: ReadonlyMap<Prefix, NamespaceDefinition>,
    ) {}

    public static module(
        document: TextDocument,
        namespaces: ReadonlyMap<Prefix, NamespaceDefinition>,
    ): Scope {
        return new Scope(undefined, 0, getDocumentText(document).length, namespaces);
    }

    public enter(startOffset: number, endOffset: number): Scope {
        const child = new Scope(this, startOffset, endOffset, this.namespaces);
        this.children.push(child);
        return child;
    }

    public declare(newDefinition: ScopeDefinition): void {
        const name = this.definitionLookupKey(newDefinition);
        if (!this.definitionByName.has(name)) {
            this.definitionByName.set(name, []);
        }

        const definitionsWithSameName = this.definitionByName.get(name)!;
        definitionsWithSameName.push(newDefinition);
    }

    public resolve<K extends keyof ReferenceNameByKind>(
        kind: K,
        name: ReferenceNameByKind[K],
        offset: number,
    ): ScopeDefinitionByReferenceKind[K] | undefined {
        const declarations = this.definitionByName.get(this.referenceLookupKey(name, kind));
        const declaration = declarations?.findLast((candidate) => candidate.visibleFrom <= offset);
        if (declaration !== undefined) {
            // Definitions and references use the same kind-prefixed lookup keys, so a
            // successful lookup has the definition type associated with K.
            return declaration as ScopeDefinitionByReferenceKind[K];
        }

        return this.parent?.resolve(kind, name, offset);
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

        for (const [name, definitions] of this.definitionByName.entries()) {
            const definition = definitions.findLast((candidate) => candidate.visibleFrom <= offset);
            if (definition !== undefined) {
                visible.set(name, definition);
            }
        }

        let current = this.parent;
        while (current !== undefined) {
            for (const [name, definitions] of current.definitionByName.entries()) {
                if (visible.has(name)) {
                    continue;
                }

                const definition = definitions.findLast(
                    (candidate) => candidate.visibleFrom <= offset,
                );

                if (definition !== undefined) {
                    visible.set(name, definition);
                }
            }

            current = current.parent;
        }

        return visible;
    }

    private functionLookupKey(name: FunctionName): string {
        return `${QNameToString(name.qname, true)}#${name.arity ?? "?"}`;
    }

    private definitionLookupKey(definition: BaseDefinition): string {
        switch (definition.kind) {
            case "namespace":
                return `namespace:${definition.name.prefix}`;
            case "function":
            case "builtin-function":
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
