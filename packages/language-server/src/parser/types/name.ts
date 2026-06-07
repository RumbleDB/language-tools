export type Prefix = string;
export type LocalName = string;

export type UnprefixedQName = {
    kind: "unprefixed-qname";
    localName: LocalName;
};

export type PrefixedQName = {
    kind: "prefixed-qname";
    prefix: Prefix;
    localName: LocalName;
};

export type LexicalQName = UnprefixedQName | PrefixedQName;

export type LexicalVarName = {
    qname: LexicalQName;
};

export type LexicalFunctionName = {
    qname: LexicalQName;
    arity?: number;
};

export type NamespaceName = {
    prefix: Prefix;
};

export type LexicalDeclarationNameByKind = {
    namespace: NamespaceName;
    function: LexicalFunctionName;
    parameter: LexicalVarName;
    "declare-variable": LexicalVarName;
    let: LexicalVarName;
    for: LexicalVarName;
    "for-position": LexicalVarName;
    "group-by": LexicalVarName;
    count: LexicalVarName;
    "catch-variable": LexicalVarName;
    type: { qname: LexicalQName };
};

export type LexicalReferenceNameByKind = {
    function: LexicalFunctionName;
    variable: LexicalVarName;
};

export function lexicalQNameToString(qname: LexicalQName): string {
    return qname.kind === "prefixed-qname" ? `${qname.prefix}:${qname.localName}` : qname.localName;
}

export function isPrefixedQName(qname: LexicalQName): qname is PrefixedQName {
    return qname.kind === "prefixed-qname";
}

export function varNameToString(name: LexicalVarName): string {
    return `$${lexicalQNameToString(name.qname)}`;
}
