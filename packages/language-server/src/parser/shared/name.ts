import type * as ctx from "server/parser/context.js";
import { LexicalFunctionName, LexicalQName, parseQNameText } from "server/parser/types/name.js";

export function parseFunctionName(
    node: ctx.FunctionDeclContext | ctx.FunctionCallContext | ctx.NamedFunctionRefContext,
    arity: number | undefined,
): LexicalFunctionName {
    const qname = parseQNameText(node.functionName()?.getText() ?? "");
    return arity === undefined ? { qname } : { qname, arity };
}

/** The function an arrow step names, which receives the left operand as an extra first argument. */
export function parseArrowFunctionName(
    node: ctx.ArrowFunctionSpecifierContext,
    explicitArgumentCount: number | undefined,
): LexicalFunctionName | null {
    const text = node.eqName()?.getText() ?? "";
    if (text === "") return null;
    const qname = parseQNameText(text);
    return explicitArgumentCount === undefined
        ? { qname }
        : { qname, arity: explicitArgumentCount + 1 };
}

export function parseVarName(node: ctx.VarRefContext | ctx.VarBindingContext): LexicalQName | null {
    const text = node.eqName()?.getText() ?? "";
    return text === "" ? null : parseQNameText(text);
}
