import { LexicalFunctionName, LexicalQName, parseQNameText } from "server/parser/types/name.js";

import * as jsoniq from "../adapters/jsoniq/grammar/JsoniqParser.js";
import * as xquery from "../adapters/xquery/grammar/XQueryParser.js";

type QnameContext = jsoniq.QnameContext | xquery.QnameContext;
type FunctionDeclContext = jsoniq.FunctionDeclContext | xquery.FunctionDeclContext;
type FunctionCallContext = jsoniq.FunctionCallContext | xquery.FunctionCallContext;
type NamedFunctionRefContext = jsoniq.NamedFunctionRefContext | xquery.NamedFunctionRefContext;
type VarRefContext = jsoniq.VarRefContext | xquery.VarRefContext;
type VarBindingContext = jsoniq.VarBindingContext | xquery.VarBindingContext;

export function parseQname(qnameNode: QnameContext): LexicalQName {
    return parseQNameText(qnameNode.getText());
}

export function parseFunctionName(
    node: FunctionDeclContext | FunctionCallContext | NamedFunctionRefContext,
): LexicalFunctionName {
    const qname = parseQNameText(node._fn_name?.getText() ?? "");

    if (node instanceof jsoniq.FunctionDeclContext || node instanceof xquery.FunctionDeclContext) {
        return { qname, arity: node.paramList()?.param().length ?? 0 };
    }
    if (node instanceof jsoniq.FunctionCallContext || node instanceof xquery.FunctionCallContext) {
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
