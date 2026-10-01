import { LexicalFunctionName, LexicalQName, parseQNameText } from "server/parser/types/name.js";

import type * as jsoniq from "../adapters/jsoniq/grammar/JsoniqParser.js";
import type * as xquery from "../adapters/xquery/grammar/XQueryParser.js";

type FunctionDeclContext = jsoniq.FunctionDeclContext | xquery.FunctionDeclContext;
type FunctionCallContext = jsoniq.FunctionCallContext | xquery.FunctionCallContext;
type NamedFunctionRefContext = jsoniq.NamedFunctionRefContext | xquery.NamedFunctionRefContext;
type VarRefContext = jsoniq.VarRefContext | xquery.VarRefContext;
type VarBindingContext = jsoniq.VarBindingContext | xquery.VarBindingContext;

export function parseFunctionName(
    node: FunctionDeclContext | FunctionCallContext | NamedFunctionRefContext,
    arity: number | undefined,
): LexicalFunctionName {
    const qname = parseQNameText(node.functionName()?.getText() ?? "");
    return arity === undefined ? { qname } : { qname, arity };
}

export function parseVarName(node: VarRefContext | VarBindingContext): LexicalQName | null {
    const text = node.eqName()?.getText() ?? "";
    return text === "" ? null : parseQNameText(text);
}
