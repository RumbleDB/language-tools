import { type LocalName, type Prefix } from "server/parser/types/name.js";

export type QName = {
    readonly localName: LocalName;
    readonly namespaceUri?: string;
    readonly prefix?: Prefix;
};

export type FunctionName = {
    readonly qname: QName;
    readonly arity?: number;
};

export type DeclarationNameByKind = {
    namespace: { readonly prefix: Prefix };
    function: FunctionName;
    parameter: QName;
    variable: QName;
    type: QName;
};

export type ReferenceNameByKind = {
    function: FunctionName;
    variable: QName;
    type: QName;
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
        case "type":
            return QNameToString(name as QName, expanded);
        default:
            throw kind satisfies never;
    }
}
