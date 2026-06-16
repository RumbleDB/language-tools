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

export type UriQualifiedQName = {
    kind: "uri-qualified-qname";
    namespaceUri: string;
    localName: LocalName;
};

export type LexicalQName = UnprefixedQName | PrefixedQName | UriQualifiedQName;

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
    parameter: LexicalQName;
    "declare-variable": LexicalQName;
    let: LexicalQName;
    for: LexicalQName;
    "for-position": LexicalQName;
    "group-by": LexicalQName;
    count: LexicalQName;
    "catch-variable": LexicalQName;
    type: { qname: LexicalQName };
};

export type LexicalReferenceNameByKind = {
    function: LexicalFunctionName;
    variable: LexicalQName;
};

export function lexicalQNameToString(qname: LexicalQName): string {
    switch (qname.kind) {
        case "prefixed-qname":
            return `${qname.prefix}:${qname.localName}`;
        case "uri-qualified-qname":
            return `Q{${qname.namespaceUri}}${qname.localName}`;
        case "unprefixed-qname":
            return qname.localName;
        default:
            throw qname satisfies never;
    }
}

export function isPrefixedQName(qname: LexicalQName): qname is PrefixedQName {
    return qname.kind === "prefixed-qname";
}

export function isUriQualifiedQName(qname: LexicalQName): qname is UriQualifiedQName {
    return qname.kind === "uri-qualified-qname";
}

export function parseQNameText(text: string): LexicalQName {
    if (text.startsWith("Q{")) {
        const namespaceEnd = text.indexOf("}");
        const namespaceUri = namespaceEnd >= 0 ? text.slice(2, namespaceEnd) : "";
        return {
            kind: "uri-qualified-qname",
            namespaceUri,
            localName: namespaceEnd >= 0 ? text.slice(namespaceEnd + 1) : text,
        };
    }

    const colonIndex = text.indexOf(":");
    if (colonIndex > 0) {
        const qname: PrefixedQName = {
            kind: "prefixed-qname",
            prefix: text.slice(0, colonIndex),
            localName: text.slice(colonIndex + 1),
        };
        return qname;
    }

    const qname: UnprefixedQName = { kind: "unprefixed-qname", localName: text };
    return qname;
}
