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
} from "./grammar/JsoniqParser.js";

export function parseQname(qnameNode: QnameContext): LexicalQName {
    return parseQNameText(qnameNode.getText());
}

export function parseQNameText(text: string): LexicalQName {
    if (text.startsWith("Q{")) {
        const namespaceEnd = text.indexOf("}");
        return {
            kind: "unprefixed-qname",
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

function functionArity(
    node: FunctionDeclContext | FunctionCallContext | NamedFunctionRefContext,
): number {
    if (node instanceof FunctionDeclContext) {
        return node.paramList()?.param().length ?? 0;
    } else if (node instanceof FunctionCallContext) {
        const argumentList = node.argumentList();
        return argumentList.argument().length;
    } else if (node instanceof NamedFunctionRefContext) {
        return Number.parseInt(node._arity?.text ?? node.IntegerLiteral().getText(), 10);
    }
    throw new Error("Unsupported node type for function arity extraction");
}

export function parseFunctionName(
    node: FunctionDeclContext | FunctionCallContext | NamedFunctionRefContext,
): LexicalFunctionName {
    const qname = parseQNameText(node._fn_name?.getText() ?? "");

    const arity = functionArity(node);

    return {
        qname,
        arity,
    };
}

export function parseVarName(node: VarRefContext): LexicalQName | null {
    const text = node._var_name?.getText() ?? "";
    return text === "" ? null : parseQNameText(text);
}

export function functionName(
    node: FunctionDeclContext | FunctionCallContext | NamedFunctionRefContext,
): string {
    return (node._fn_name?.getText() ?? "").trim();
}
