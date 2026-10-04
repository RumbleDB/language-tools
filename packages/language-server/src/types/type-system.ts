/** Resolved name, independent of the parser's lexical QName representation. */
export interface QName {
    readonly localName: string;
    readonly namespaceUri?: string;
    readonly prefix?: string;
}

/** Engine metadata shared by inferred static types and query-result dynamic types. */
export interface TypeMetadata {
    name?: QName;
    displayName?: string;
    /** Expanded QName, independent of namespace prefixes. */
    qname?: string;
}

export interface NamedTypeDefinition extends TypeMetadata {
    kind: "named";
    name: QName;
}

/** Anonymous type whose structure is not represented by this model yet. */
export interface OpaqueTypeDefinition extends TypeMetadata {
    kind: "opaque";
    name?: never;
    qname?: never;
    displayName: string;
}

export interface ObjectTypeDefinition extends TypeMetadata {
    kind: "object";
    fields: Record<string, TypeDefinition>;
}

export interface ArrayTypeDefinition extends TypeMetadata {
    kind: "array";
    content?: TypeDefinition;
}

export interface UnionTypeDefinition extends TypeMetadata {
    kind: "union";
    members: TypeDefinition[];
}

export type TypeDefinition =
    | NamedTypeDefinition
    | OpaqueTypeDefinition
    | ObjectTypeDefinition
    | ArrayTypeDefinition
    | UnionTypeDefinition;

export interface SequenceType {
    itemType: TypeDefinition;
    arity: string;
}
