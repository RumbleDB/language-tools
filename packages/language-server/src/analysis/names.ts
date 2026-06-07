import { type LocalName, type Prefix } from "server/parser/types/name.js";

export type ResolvedQName = {
    localName: LocalName;
    namespaceUri?: string;
    lexicalPrefix?: Prefix;
};

export type ResolvedVarName = {
    qname: ResolvedQName;
};

export type ResolvedFunctionName = {
    qname: ResolvedQName;
    arity?: number;
};

export type ResolvedDeclarationNameByKind = {
    namespace: { prefix: Prefix };
    function: ResolvedFunctionName;
    parameter: ResolvedVarName;
    "declare-variable": ResolvedVarName;
    let: ResolvedVarName;
    for: ResolvedVarName;
    "for-position": ResolvedVarName;
    "group-by": ResolvedVarName;
    count: ResolvedVarName;
    "catch-variable": ResolvedVarName;
    type: { qname: ResolvedQName };
};

export type ResolvedReferenceNameByKind = {
    function: ResolvedFunctionName;
    variable: ResolvedVarName;
};

export function resolvedQNameToString(qname: ResolvedQName): string {
    return qname.lexicalPrefix === undefined
        ? qname.localName
        : `${qname.lexicalPrefix}:${qname.localName}`;
}

export function expandedQNameToString(qname: ResolvedQName): string {
    return qname.namespaceUri === undefined
        ? resolvedQNameToString(qname)
        : `Q{${qname.namespaceUri}}${qname.localName}`;
}

export function sameResolvedQName(left: ResolvedQName, right: ResolvedQName): boolean {
    return left.namespaceUri === right.namespaceUri && left.localName === right.localName;
}

export function resolvedVarNameToString(name: ResolvedVarName): string {
    return `$${resolvedQNameToString(name.qname)}`;
}

export function resolvedFunctionNameToString(name: ResolvedFunctionName): string {
    return `${resolvedQNameToString(name.qname)}#${name.arity ?? "?"}`;
}

export function resolvedReferenceNameToString<K extends keyof ResolvedReferenceNameByKind>(
    name: ResolvedReferenceNameByKind[K],
    kind: K,
): string {
    switch (kind) {
        case "function":
            return resolvedFunctionNameToString(name as ResolvedFunctionName);
        case "variable":
            return resolvedVarNameToString(name as ResolvedVarName);
        default:
            throw kind satisfies never;
    }
}
