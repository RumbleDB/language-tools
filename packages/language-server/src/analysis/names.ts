import { type LocalName, type Prefix } from "server/parser/types/name.js";

export type QName = {
    localName: LocalName;
    namespaceUri?: string;
    prefix?: Prefix;
};

export type FunctionName = {
    qname: QName;
    arity?: number;
};

export type DeclarationNameByKind = {
    namespace: { prefix: Prefix };
    function: FunctionName;
    parameter: QName;
    "declare-variable": QName;
    let: QName;
    for: QName;
    "for-position": QName;
    "group-by": QName;
    count: QName;
    "catch-variable": QName;
    type: QName;
};

export type ReferenceNameByKind = {
    function: FunctionName;
    variable: QName;
};

export function QNameToString(qname: QName, expanded: boolean): string {
    if (expanded) {
        return qname.namespaceUri === undefined
            ? QNameToString(qname, false)
            : `Q{${qname.namespaceUri}}${qname.localName}`;
    }
    return qname.prefix === undefined ? qname.localName : `${qname.prefix}:${qname.localName}`;
}

export function sameQName(left: QName, right: QName): boolean {
    return left.namespaceUri === right.namespaceUri && left.localName === right.localName;
}

export function functionNameToString(name: FunctionName, expanded: boolean): string {
    return `${QNameToString(name.qname, expanded)}#${name.arity ?? "?"}`;
}

export function referenceNameToString<K extends keyof ReferenceNameByKind>(
    name: ReferenceNameByKind[K],
    kind: K,
    expanded: boolean,
): string {
    switch (kind) {
        case "function":
            return functionNameToString(name as FunctionName, expanded);
        case "variable":
            return QNameToString(name as QName, expanded);
        default:
            throw kind satisfies never;
    }
}
