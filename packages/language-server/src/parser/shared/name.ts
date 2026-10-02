import type * as ctx from "server/parser/context.js";
import { LexicalFunctionName, LexicalQName, parseQNameText } from "server/parser/types/name.js";

export function parseFunctionName(
    node: ctx.FunctionDeclContext | ctx.FunctionCallContext | ctx.NamedFunctionRefContext,
    arity: number | undefined,
): LexicalFunctionName {
    const qname = parseQNameText(node.functionName()?.getText() ?? "");
    return arity === undefined ? { qname } : { qname, arity };
}

export function parseVarName(node: ctx.VarRefContext | ctx.VarBindingContext): LexicalQName | null {
    const text = node.eqName()?.getText() ?? "";
    return text === "" ? null : parseQNameText(text);
}
