import {
    type ParseTree,
    type ParseTreeVisitor,
    ParserRuleContext,
    TerminalNode,
    type Token,
} from "antlr4ng";
import type { SharedRule, SharedRuleIndexes } from "server/parser/context.js";

import type { FormatterContext } from "../context.js";
import { concat, type Doc, group, indent, isEmptyDoc, line, NIL, space } from "../doc.js";
import { type CompactTokenTypes, formatCompact } from "./path.js";
import type { Visit } from "./types.js";

/**
 * The layout of the rules that a language adapter does not format with a visitor of its own. Most rules are laid out
 * as their source spaces them. Two kinds of rules have a layout of their own:
 * - compact rules, such as path steps and type tests, whose parts are written together;
 * - binary operator rules, such as `$a + $b`, whose operators are spaced and where a long chain breaks.
 */
export interface DefaultLayoutRules {
    readonly compact: ReadonlySet<number>;
    readonly compactTokens: CompactTokenTypes;
    readonly binaryOperators: ReadonlySet<number>;
}

/** Path steps and type tests, whose parts are written without spaces between them. */
const COMPACT_RULES: readonly SharedRule[] = [
    "RULE_pathExpr",
    "RULE_relativePathExpr",
    "RULE_axisStep",
    "RULE_forwardStep",
    "RULE_reverseStep",
    "RULE_forwardAxis",
    "RULE_reverseAxis",
    "RULE_abbrevForwardStep",
    "RULE_nodeTest",
    "RULE_nameTest",
    "RULE_predicateList",
    "RULE_itemType",
    "RULE_anyKindTest",
    "RULE_binaryNodeTest",
    "RULE_documentTest",
    "RULE_textTest",
    "RULE_commentTest",
    "RULE_namespaceNodeTest",
    "RULE_piTest",
    "RULE_attributeTest",
    "RULE_schemaAttributeTest",
    "RULE_elementTest",
    "RULE_schemaElementTest",
    "RULE_anyFunctionTest",
    "RULE_typedFunctionTest",
    "RULE_anyMapTest",
    "RULE_typedMapTest",
    "RULE_anyArrayTest",
    "RULE_typedArrayTest",
    "RULE_parenthesizedItemTest",
];

/** The binary operator rules, whose children alternate between operands and operators. */
const BINARY_OPERATOR_RULES: readonly SharedRule[] = [
    "RULE_orExpr",
    "RULE_andExpr",
    "RULE_comparisonExpr",
    "RULE_stringConcatExpr",
    "RULE_rangeExpr",
    "RULE_additiveExpr",
    "RULE_multiplicativeExpr",
    "RULE_unionExpr",
    "RULE_intersectExceptExpr",
    "RULE_simpleMapExpr",
];

/** A parser, as the indexes of its rules and the token types that the compact layout spaces. */
export type LayoutGrammar = SharedRuleIndexes & CompactTokenTypes;

/** The default layout rules of a parser. */
export function defaultLayoutRules(parser: LayoutGrammar): DefaultLayoutRules {
    return {
        compact: new Set(COMPACT_RULES.map((rule) => parser[rule])),
        compactTokens: parser,
        binaryOperators: new Set(BINARY_OPERATOR_RULES.map((rule) => parser[rule])),
    };
}

/**
 * Visits a node of the parse tree. The comments on their own lines before a rule are printed before it, outside its
 * layout, so that they do not make it break. The outermost rule that starts at a token prints its comments.
 */
export function visitWithLeadingComments(
    context: FormatterContext,
    node: ParseTree | null | undefined,
    visitor: ParseTreeVisitor<Doc>,
): Doc {
    if (node === null || node === undefined) {
        return NIL;
    }
    const leading =
        node instanceof ParserRuleContext && node.start
            ? context.flushLeadingDoc(node.start.tokenIndex)
            : NIL;
    return concat([leading, node.accept(visitor) ?? NIL]);
}

/** Formats a rule that the language adapter does not format itself. */
export function formatWithDefaultLayout(
    context: FormatterContext,
    node: ParserRuleContext,
    rules: DefaultLayoutRules,
    visit: Visit,
): Doc {
    if (rules.compact.has(node.ruleIndex)) {
        return formatCompact(node, rules.compactTokens, visit);
    }
    if (rules.binaryOperators.has(node.ruleIndex)) {
        return formatBinaryOperatorChain(node, visit);
    }
    return formatWithSourceSpacing(context, node, visit);
}

/**
 * Formats a chain of binary operators, such as `$a + $b + $c`, with a space around each operator. When the chain does
 * not fit on the line, it breaks before each of its operators.
 */
function formatBinaryOperatorChain(node: ParserRuleContext, visit: Visit): Doc {
    const [first, ...rest] = node.children;
    if (first === undefined) {
        return NIL;
    }
    if (rest.length === 0) {
        return visit(first);
    }
    const operations: Doc[] = [];
    for (let index = 0; index + 1 < rest.length; index += 2) {
        operations.push(line, visit(rest[index]!), space, visit(rest[index + 1]!));
    }
    return group(concat([visit(first), indent(concat(operations))]));
}

/**
 * Formats the children of a rule with a space between two of them only where the source has one, because only the
 * source tells whether a space belongs there: `concat#2`, `-1` and `f()` have none, `cast as` has one.
 */
function formatWithSourceSpacing(
    context: FormatterContext,
    node: ParserRuleContext,
    visit: Visit,
): Doc {
    const docs: Doc[] = [];
    let previous: Token | null = null;
    for (const child of node.children) {
        const doc = visit(child);
        const tokens = sourceTokens(child);
        if (tokens === null || isEmptyDoc(doc)) {
            continue;
        }
        if (previous !== null && context.hasGapBetween(previous, tokens.start)) {
            docs.push(space);
        }
        docs.push(doc);
        previous = tokens.stop;
    }
    return concat(docs);
}

/** The first and last tokens of a node, or null for a rule that matched no token. */
function sourceTokens(node: ParseTree): { start: Token; stop: Token } | null {
    if (node instanceof TerminalNode) {
        return { start: node.symbol, stop: node.symbol };
    }
    if (node instanceof ParserRuleContext && node.start && node.stop) {
        return { start: node.start, stop: node.stop };
    }
    return null;
}
