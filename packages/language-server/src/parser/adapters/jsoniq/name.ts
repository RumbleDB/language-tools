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

function functionArity(
    node: FunctionDeclContext | FunctionCallContext | NamedFunctionRefContext,
): number | undefined {
    if (node instanceof FunctionDeclContext) {
        return node.paramList()?.param().length ?? 0;
    } else if (node instanceof FunctionCallContext) {
        return node.argumentList()?.argument().length;
    } else if (node instanceof NamedFunctionRefContext) {
        const arity = node._arity?.text ?? node.IntegerLiteral()?.getText();
        if (arity === undefined) return undefined;
        const parsed = Number.parseInt(arity, 10);
        return Number.isNaN(parsed) ? undefined : parsed;
    }
    throw new Error("Unsupported node type for function arity extraction");
}

export function parseFunctionName(
    node: FunctionDeclContext | FunctionCallContext | NamedFunctionRefContext,
): LexicalFunctionName {
    const qname = parseQNameText(node._fn_name?.getText() ?? "");
    const arity = functionArity(node);

    return arity === undefined ? { qname } : { qname, arity };
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
