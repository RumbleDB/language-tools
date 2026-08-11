import { LexicalFunctionName, LexicalQName, parseQNameText } from "server/parser/types/name.js";

import {
    FunctionCallContext,
    FunctionDeclContext,
    NamedFunctionRefContext,
    QnameContext,
    VarBindingContext,
    VarRefContext,
} from "./grammar/JsoniqParser.js";

export function parseQname(qnameNode: QnameContext): LexicalQName {
    return parseQNameText(qnameNode.getText());
}

export function parseFunctionName(
    node: FunctionDeclContext | FunctionCallContext | NamedFunctionRefContext,
): LexicalFunctionName {
    const qname = parseQNameText(node._fn_name?.getText() ?? "");

    if (node instanceof FunctionDeclContext) {
        return { qname, arity: node.paramList()?.param().length ?? 0 };
    }
    if (node instanceof FunctionCallContext) {
        const arity = node.argumentList()?.argument().length;
        return arity === undefined ? { qname } : { qname, arity };
    }

    const arity = Number.parseInt(node._arity?.text ?? node.IntegerLiteral()?.getText() ?? "", 10);
    return Number.isNaN(arity) ? { qname } : { qname, arity };
}

export function parseVarName(node: VarRefContext | VarBindingContext): LexicalQName | null {
    const text = node._var_name?.getText() ?? "";
    return text === "" ? null : parseQNameText(text);
}

export function functionName(
    node: FunctionDeclContext | FunctionCallContext | NamedFunctionRefContext,
): string {
    return (node._fn_name?.getText() ?? "").trim();
}
