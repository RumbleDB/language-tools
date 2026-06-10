import { type Prefix } from "server/parser/types/name.js";
import { getDocumentText } from "server/parser/utils.js";
import { TextDocument } from "vscode-languageserver-textdocument";

import { BaseDefinition, SourceDefinition, SourceNamespaceDefinition } from "./definitions.js";
import { QName, QNameToString, type FunctionName, type ReferenceNameByKind } from "./names.js";

export class Scope {
    private readonly definitionByName = new Map<string, SourceDefinition[]>();
    private readonly children: Scope[] = [];

    private constructor(
        public readonly parent: Scope | undefined,
        public readonly startOffset: number,
        public readonly endOffset: number,
        private readonly namespaces: ReadonlyMap<Prefix, SourceNamespaceDefinition>,
    ) {}

    public static module(
        document: TextDocument,
        namespaces: ReadonlyMap<Prefix, SourceNamespaceDefinition>,
    ): Scope {
        return new Scope(undefined, 0, getDocumentText(document).length, namespaces);
    }

    public enter(startOffset: number, endOffset: number): Scope {
        const child = new Scope(this, startOffset, endOffset, this.namespaces);
        this.children.push(child);
        return child;
    }

    public declare(newDefinition: SourceDefinition): void {
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
    ): SourceDefinition | undefined {
        const declarations = this.definitionByName.get(this.referenceLookupKey(name, kind));
        const declaration = declarations?.at(-1);
        if (declaration !== undefined) {
            return declaration;
        }

        return this.parent?.resolve(kind, name);
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
    public listVisibleDefinitions(offset: number): Map<string, SourceDefinition> {
        const visible = new Map<string, SourceDefinition>();

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
                return definition.name.prefix;
            case "function":
            case "builtin-function":
                return this.functionLookupKey(definition.name);
            case "type":
                return QNameToString(definition.name, true);
            case "parameter":
            case "declare-variable":
            case "let":
            case "for":
            case "for-position":
            case "group-by":
            case "count":
            case "catch-variable":
                return QNameToString(definition.name, true);
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
                return this.functionLookupKey(name as FunctionName);
            case "variable":
                return QNameToString(name as QName, true);
            default:
                throw kind satisfies never;
        }
    }
}
