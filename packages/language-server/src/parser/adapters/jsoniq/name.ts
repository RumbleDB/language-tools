import {
    LexicalFunctionName,
    LexicalQName,
    type PrefixedQName,
    type UnprefixedQName,
} from "server/parser/types/name.js";

import {
    FunctionCallContext,
    FunctionDeclContext,
    NamedFunctionRefContext,
    QnameContext,
    VarRefContext,
} from "./grammar/jsoniqParser.js";

export function parseQname(qnameNode: QnameContext): LexicalQName {
    const prefix = qnameNode._ns?.text ?? qnameNode._nskw?.getText() ?? undefined;
    const localName = qnameNode._local_name?.text ?? qnameNode._local_namekw?.getText() ?? "";

    if (prefix) {
        const qname: PrefixedQName = { kind: "prefixed-qname", prefix, localName };
        return qname;
    }

    const qname: UnprefixedQName = { kind: "unprefixed-qname", localName };
    return qname;
}

function functionArity(
    node: FunctionDeclContext | FunctionCallContext | NamedFunctionRefContext,
): number {
    if (node instanceof FunctionDeclContext) {
        return node.paramList()?.param().length ?? 0;
    } else if (node instanceof FunctionCallContext) {
        const argumentList = node.argumentList();
        const argumentCount = argumentList.argument().length;
        const hasTrailingComma = argumentList._trailingComma != null;
        return hasTrailingComma ? argumentCount + 1 : argumentCount;
    } else if (node instanceof NamedFunctionRefContext) {
        return Number.parseInt(node._arity?.text ?? node.Literal().getText(), 10);
    }
    throw new Error("Unsupported node type for function arity extraction");
}

export function parseFunctionName(
    node: FunctionDeclContext | FunctionCallContext | NamedFunctionRefContext,
): LexicalFunctionName {
    const qnameNode =
        node instanceof FunctionDeclContext ? node.declaredQName().qname() : node.qname();
    const qname = parseQname(qnameNode);

    const arity = functionArity(node);

    return {
        qname,
        arity,
    };
}

export function parseVarName(node: VarRefContext): LexicalQName | null {
    const qname = node.qname();
    return qname === null ? null : parseQname(qname);
}

export function functionName(
    node: FunctionDeclContext | FunctionCallContext | NamedFunctionRefContext,
): string {
    return (node._fn_name?.getText() ?? "").trim();
}
