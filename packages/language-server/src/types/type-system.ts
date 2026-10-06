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

/** An optional field may be absent from an object; when present, it holds one item of its type. */
export interface ObjectFieldDefinition {
    type: TypeDefinition;
    required: boolean;
}

export interface ObjectTypeDefinition extends TypeMetadata {
    kind: "object";
    fields: Record<string, ObjectFieldDefinition>;
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
