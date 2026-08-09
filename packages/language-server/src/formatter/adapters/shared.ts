import { TerminalNode, type ParseTree, type ParserRuleContext, type Token } from "antlr4ng";
import type * as jsoniq from "server/parser/adapters/jsoniq/grammar/JsoniqParser.js";
import type * as xquery from "server/parser/adapters/xquery/grammar/XQueryParser.js";

import { composeTokenDoc, type FormatterContext, type TokenDoc } from "../context.js";
import {
    concat,
    type Doc,
    group,
    hardline,
    indent,
    join,
    line,
    NIL,
    softline,
    space,
    spacedDocs,
} from "../doc.js";
import {
    formatBlockDoc,
    formatFlworExpressionDoc,
    formatIfExpressionDoc,
    formatTryCatchDoc,
    groupStartingWith,
    shouldSeparateDeclarations,
} from "../helpers.js";
import { printDocToString } from "../printer.js";
import { formatTokenSeparatedDocs } from "./tokens.js";

type SourceTerminal = TerminalNode | TerminalNode[] | Token | null | undefined;
type FormatTerminal = (terminal: SourceTerminal, expectedToken: number | string) => Doc;
type FormatToken = (terminal: SourceTerminal, expectedToken: number | string) => TokenDoc;
type Visit = (node: ParseTree | null | undefined) => Doc;

type BoundarySpaceDeclaration = jsoniq.BoundarySpaceDeclContext | xquery.BoundarySpaceDeclContext;
type FunctionDeclaration = jsoniq.FunctionDeclContext | xquery.FunctionDeclContext;
type VariableDeclaration = jsoniq.VarDeclContext | xquery.VarDeclContext;
type IfExpression = jsoniq.IfExprContext | xquery.IfExprContext;
type TryCatchExpression = jsoniq.TryCatchExprContext | xquery.TryCatchExprContext;
type PairConstructor = jsoniq.PairConstructorContext | xquery.PairConstructorContext;
type Predicate = jsoniq.PredicateContext | xquery.PredicateContext;
type VariableName =
    | jsoniq.VarRefContext
    | jsoniq.VarBindingContext
    | xquery.VarRefContext
    | xquery.VarBindingContext;
type EnclosedExpression = jsoniq.EnclosedExpressionContext | xquery.EnclosedExpressionContext;
type SequenceType = jsoniq.SequenceTypeContext | xquery.SequenceTypeContext;
type CatchClause = jsoniq.CatchClauseContext | xquery.CatchClauseContext;
type SwitchExpression = jsoniq.SwitchExprContext | xquery.SwitchExprContext;
type SwitchCaseClause = jsoniq.SwitchCaseClauseContext | xquery.SwitchCaseClauseContext;
type TypeswitchExpression = jsoniq.TypeswitchExprContext | xquery.TypeswitchExprContext;
type CaseClause = jsoniq.CaseClauseContext | xquery.CaseClauseContext;
type FlworExpression = jsoniq.FlworExprContext | xquery.FlworExprContext;
type ForClause = jsoniq.ForClauseContext | xquery.ForClauseContext;
type ForVariable = jsoniq.ForVarContext | xquery.ForVarContext;
type LetClause = jsoniq.LetClauseContext | xquery.LetClauseContext;
type LetVariable = jsoniq.LetVarContext | xquery.LetVarContext;
type WhereClause = jsoniq.WhereClauseContext | xquery.WhereClauseContext;
type GroupByClause = jsoniq.GroupByClauseContext | xquery.GroupByClauseContext;
type GroupByVariable = jsoniq.GroupByVarContext | xquery.GroupByVarContext;
type OrderByClause = jsoniq.OrderByClauseContext | xquery.OrderByClauseContext;
type CountClause = jsoniq.CountClauseContext | xquery.CountClauseContext;
type ExpressionSequence = jsoniq.ExprContext | xquery.ExprContext;
type LibraryModule = jsoniq.LibraryModuleContext | xquery.LibraryModuleContext;
type MainModule = jsoniq.MainModuleContext | xquery.MainModuleContext;
type Prolog = jsoniq.PrologContext | xquery.PrologContext;
type AnnotatedDeclaration = jsoniq.AnnotatedDeclContext | xquery.AnnotatedDeclContext;
type ParameterList = jsoniq.ParamListContext | xquery.ParamListContext;
type Parameter = jsoniq.ParamContext | xquery.ParamContext;
type Annotations = jsoniq.AnnotationsContext | xquery.AnnotationsContext;
type Annotation = jsoniq.AnnotationContext | xquery.AnnotationContext;
type SquareArrayConstructor =
    | jsoniq.SquareArrayConstructorContext
    | xquery.SquareArrayConstructorContext;
type CurlyArrayConstructor =
    | jsoniq.CurlyArrayConstructorContext
    | xquery.CurlyArrayConstructorContext;
type PostfixExpression = jsoniq.PostfixExprContext | xquery.PostfixExprContext;
type ParenthesizedExpression = jsoniq.ParenthesizedExprContext | xquery.ParenthesizedExprContext;
type FunctionCall = jsoniq.FunctionCallContext | xquery.FunctionCallContext;
type ArgumentList = jsoniq.ArgumentListContext | xquery.ArgumentListContext;
type Argument = jsoniq.ArgumentContext | xquery.ArgumentContext;

type QueryModule = jsoniq.ModuleContext | xquery.ModuleContext;

export function formatDocumentRoot(context: FormatterContext, body: Doc): Doc {
    return concat([body, context.formatDanglingDoc()]);
}

export function formatModule(
    node: QueryModule,
    languageTerminal: SourceTerminal,
    languageName: string,
    visit: Visit,
    formatTerminal: FormatTerminal,
): Doc {
    const parts: Doc[] = [];
    if (languageTerminal) {
        const encoding = node._encoding
            ? concat([
                  space,
                  formatTerminal(node.KW_ENCODING(), "encoding"),
                  space,
                  visit(node._encoding),
              ])
            : NIL;
        parts.push(
            concat([
                formatTerminal(languageTerminal, languageName),
                space,
                formatTerminal(node.KW_VERSION(), "version"),
                space,
                visit(node._vers),
                encoding,
                formatTerminal(node.SEMICOLON(), ";"),
            ]),
        );
    }

    const libraryModule = node.libraryModule();
    if (libraryModule) {
        parts.push(visit(libraryModule));
    } else {
        const mainModules = node.mainModule();
        const modules = Array.isArray(mainModules) ? mainModules : mainModules ? [mainModules] : [];
        parts.push(...modules.map(visit));
    }
    return join(concat([hardline, hardline]), parts);
}

export function formatParameterList(
    node: ParameterList,
    commaTokenType: number,
    visit: Visit,
    formatTerminal: FormatTerminal,
): Doc {
    return formatTokenSeparatedDocs(
        node.param().map(visit),
        node.getTokens(commaTokenType),
        (comma) => formatTerminal(comma, ","),
    );
}

export function formatParameter(
    node: Parameter,
    visit: Visit,
    formatTerminal: FormatTerminal,
): Doc {
    const parameter = visit(node.varBinding());
    const sequenceType = node.sequenceType();
    return sequenceType
        ? concat([parameter, space, formatTerminal(node.KW_AS(), "as"), space, visit(sequenceType)])
        : parameter;
}

export function formatAnnotations(node: Annotations, visit: Visit): Doc {
    return join(space, node.annotation().map(visit));
}

export function formatAnnotation(
    node: Annotation,
    commaTokenType: number,
    visit: Visit,
    formatTerminal: FormatTerminal,
): Doc {
    const prefix = concat([formatTerminal(node.MOD(), "%"), visit(node._name)]);
    const literals = node.literal().map(visit);
    if (literals.length === 0) {
        return prefix;
    }
    return concat([
        prefix,
        formatTerminal(node.LPAREN(), "("),
        formatTokenSeparatedDocs(literals, node.getTokens(commaTokenType), (comma) =>
            formatTerminal(comma, ","),
        ),
        formatTerminal(node.RPAREN(), ")"),
    ]);
}

export function formatPairObjectConstructor(
    firstToken: TokenDoc,
    afterFirstToken: Doc,
    rightBrace: Doc,
    pairs: readonly Doc[],
    commas: readonly TerminalNode[],
    formatTerminal: FormatTerminal,
): Doc {
    const opening = concat([composeTokenDoc(firstToken), afterFirstToken]);
    if (pairs.length === 0) {
        return concat([opening, rightBrace]);
    }

    const formatPairs = (breakDoc: Doc): Doc =>
        formatTokenSeparatedDocs(pairs, commas, (comma) => formatTerminal(comma, ","), breakDoc);
    if (pairs.length > 2) {
        return concat([
            opening,
            indent(concat([hardline, formatPairs(hardline)])),
            hardline,
            rightBrace,
        ]);
    }

    return groupStartingWith(
        firstToken,
        concat([afterFirstToken, indent(concat([line, formatPairs(line)])), line, rightBrace]),
    );
}

export function formatSquareArrayConstructor(
    node: SquareArrayConstructor,
    commaTokenType: number,
    visit: Visit,
    formatToken: FormatToken,
    formatTerminal: FormatTerminal,
): Doc {
    const leftBracket = formatToken(node.LBRACKET(), "[");
    const rightBracket = formatTerminal(node.RBRACKET(), "]");
    const items = node.exprSingle().map(visit);
    if (items.length === 0) {
        return concat([composeTokenDoc(leftBracket), rightBracket]);
    }
    return groupStartingWith(
        leftBracket,
        concat([
            indent(
                concat([
                    line,
                    formatTokenSeparatedDocs(items, node.getTokens(commaTokenType), (comma) =>
                        formatTerminal(comma, ","),
                    ),
                ]),
            ),
            line,
            rightBracket,
        ]),
    );
}

export function formatCurlyArrayConstructor(
    node: CurlyArrayConstructor,
    visit: Visit,
    formatTerminal: FormatTerminal,
): Doc {
    return concat([
        formatTerminal(node.KW_ARRAY(), "array"),
        space,
        visit(node.enclosedExpression()),
    ]);
}

export function formatPostfixExpression(node: PostfixExpression, visit: Visit): Doc {
    const parts: Doc[] = [];
    for (let index = 0; index < node.getChildCount(); index++) {
        parts.push(visit(node.getChild(index)));
    }
    return concat(parts);
}

function formatParenthesizedList(
    leftParenthesis: SourceTerminal,
    rightParenthesis: SourceTerminal,
    items: Doc[],
    commas: TerminalNode[],
    formatTerminal: FormatTerminal,
): Doc {
    const left = formatTerminal(leftParenthesis, "(");
    const right = formatTerminal(rightParenthesis, ")");
    if (items.length === 0) {
        return concat([left, right]);
    }
    return concat([
        left,
        group(
            concat([
                indent(
                    concat([
                        softline,
                        formatTokenSeparatedDocs(items, commas, (comma) =>
                            formatTerminal(comma, ","),
                        ),
                    ]),
                ),
                softline,
                right,
            ]),
        ),
    ]);
}

export function formatParenthesizedExpression(
    node: ParenthesizedExpression,
    commaTokenType: number,
    visit: Visit,
    formatTerminal: FormatTerminal,
): Doc {
    const expression = node.expr();
    const items = expression
        ? "exprSingle" in expression && typeof expression.exprSingle === "function"
            ? expression.exprSingle().map(visit)
            : [visit(expression)]
        : [];
    return formatParenthesizedList(
        node.LPAREN(),
        node.RPAREN(),
        items,
        node.getTokens(commaTokenType),
        formatTerminal,
    );
}

export function formatFunctionCall(node: FunctionCall, visit: Visit): Doc {
    return concat([visit(node._fn_name), visit(node.argumentList())]);
}

export function formatArgumentList(
    node: ArgumentList,
    commaTokenType: number,
    visit: Visit,
    formatTerminal: FormatTerminal,
): Doc {
    return formatParenthesizedList(
        node.LPAREN(),
        node.RPAREN(),
        node.argument().map(visit),
        node.getTokens(commaTokenType),
        formatTerminal,
    );
}

export function formatArgument(node: Argument, visit: Visit, formatTerminal: FormatTerminal): Doc {
    return node.QUESTION() !== null
        ? formatTerminal(node.QUESTION(), "?")
        : visit(node.exprSingle());
}

export function formatBoundarySpaceDeclaration(
    context: FormatterContext,
    node: BoundarySpaceDeclaration,
    formatTerminal: FormatTerminal,
): Doc {
    const isPreserve = node.KW_PRESERVE() !== null;
    context.setXmlBoundarySpacePolicy(isPreserve ? "preserve" : "strip");
    return concat([
        formatTerminal(node.KW_DECLARE(), "declare"),
        space,
        formatTerminal(node.KW_BOUNDARY_SPACE(), "boundary-space"),
        space,
        formatTerminal(
            isPreserve ? node.KW_PRESERVE() : node.KW_STRIP(),
            isPreserve ? "preserve" : "strip",
        ),
        formatTerminal(node.SEMICOLON(), ";"),
    ]);
}

export function formatLibraryModule(
    node: LibraryModule,
    visit: Visit,
    formatTerminal: FormatTerminal,
): Doc {
    const header = concat([
        formatTerminal(node.KW_MODULE(), "module"),
        space,
        formatTerminal(node.KW_NAMESPACE(), "namespace"),
        space,
        visit(node.ncName()),
        space,
        formatTerminal(node.EQUAL(), "="),
        space,
        visit(node._uri),
        formatTerminal(node.SEMICOLON(), ";"),
    ]);
    const prolog = visit(node.prolog());
    return prolog.kind !== "text" ? concat([header, hardline, hardline, prolog]) : header;
}

export function formatMainModule(node: MainModule, visit: Visit): Doc {
    const prolog = visit(node.prolog());
    const program = visit(node.program());
    if (prolog.kind !== "text" && program.kind !== "text") {
        return concat([prolog, hardline, hardline, program]);
    }
    return prolog.kind !== "text" ? prolog : program;
}

export function formatProlog(context: FormatterContext, node: Prolog, visit: Visit): Doc {
    const parts: Doc[] = [];
    for (let index = 0; index < node.getChildCount(); index++) {
        const child = node.getChild(index);
        if (child === null || child instanceof TerminalNode) {
            continue;
        }
        const declaration = visit(child);
        if (declaration.kind !== "text" || declaration.text !== "") {
            parts.push(declaration);
        }
    }
    if (parts.length === 0) {
        return NIL;
    }

    const docs: Doc[] = [parts[0]!];
    for (let index = 1; index < parts.length; index++) {
        const previous = printDocToString(parts[index - 1]!, context.options);
        const current = printDocToString(parts[index]!, context.options);
        docs.push(
            context.options.blankLineBetweenDeclarations &&
                shouldSeparateDeclarations(previous, current)
                ? concat([hardline, hardline])
                : hardline,
            parts[index]!,
        );
    }
    return concat(docs);
}

export function formatAnnotatedDeclaration(node: AnnotatedDeclaration, visit: Visit): Doc {
    const parts: Doc[] = [];
    for (let index = 0; index < node.getChildCount(); index++) {
        const child = node.getChild(index);
        if (child !== null) {
            const declaration = visit(child);
            if (declaration.kind !== "text" || declaration.text !== "") {
                parts.push(declaration);
            }
        }
    }
    return concat(parts);
}

export function formatFunctionDeclaration(
    node: FunctionDeclaration,
    visit: Visit,
    formatTerminal: FormatTerminal,
): Doc {
    const declaration = formatTerminal(node.KW_DECLARE(), "declare");
    const annotations = visit(node.annotations());
    const functionKeyword = formatTerminal(node.KW_FUNCTION(), "function");
    const name = visit(node.functionName());
    const parameters = concat([
        formatTerminal(node.LPAREN(), "("),
        visit(node.paramList()),
        formatTerminal(node.RPAREN(), ")"),
    ]);
    const signature = spacedDocs(
        declaration,
        annotations,
        functionKeyword,
        concat([name, parameters]),
    );
    const returnType = node._return_type;
    const withReturnType = returnType
        ? spacedDocs(signature, formatTerminal(node.KW_AS(), "as"), visit(returnType))
        : signature;
    const semicolon = formatTerminal(node.SEMICOLON(), ";");

    if (node.KW_EXTERNAL() !== null || node._is_external !== undefined) {
        return concat([
            withReturnType,
            space,
            formatTerminal(node.KW_EXTERNAL(), "external"),
            semicolon,
        ]);
    }
    if (!node._fn_body) {
        return concat([withReturnType, semicolon]);
    }
    return concat([
        withReturnType,
        space,
        formatBlockDoc(
            formatTerminal(node.LBRACE(), "{"),
            visit(node._fn_body),
            formatTerminal(node.RBRACE(), "}"),
        ),
        semicolon,
    ]);
}

export function formatVariableDeclaration(
    node: VariableDeclaration,
    visit: Visit,
    formatTerminal: FormatTerminal,
): Doc {
    const declaration = formatTerminal(node.KW_DECLARE(), "declare");
    const annotations = visit(node.annotations());
    const variableKeyword = formatTerminal(node.KW_VARIABLE(), "variable");
    const name = visit(node.varBinding());
    const prefix = spacedDocs(declaration, annotations, variableKeyword, name);
    const sequenceType = node.sequenceType();
    const typed = sequenceType
        ? spacedDocs(prefix, formatTerminal(node.KW_AS(), "as"), visit(sequenceType))
        : prefix;
    const semicolon = formatTerminal(node.SEMICOLON(), ";");

    if (node.KW_EXTERNAL() !== null || node._external !== undefined) {
        return concat([typed, space, formatTerminal(node.KW_EXTERNAL(), "external"), semicolon]);
    }

    const expression = node.exprSingle();
    return concat([
        typed,
        expression
            ? concat([space, formatTerminal(node.COLON_EQ(), ":="), space, visit(expression)])
            : NIL,
        semicolon,
    ]);
}

export function formatIfExpression(
    node: IfExpression,
    visit: Visit,
    formatTerminal: FormatTerminal,
): Doc {
    return formatIfExpressionDoc(
        formatTerminal(node.KW_IF(), "if"),
        formatTerminal(node.LPAREN(), "("),
        visit(node._test_condition),
        formatTerminal(node.RPAREN(), ")"),
        formatTerminal(node.KW_THEN(), "then"),
        visit(node._branch),
        formatTerminal(node.KW_ELSE(), "else"),
        visit(node._else_branch),
    );
}

export function formatTryCatchExpression(
    node: TryCatchExpression,
    visit: Visit,
    formatTerminal: FormatTerminal,
): Doc {
    return formatTryCatchDoc(
        formatTerminal(node.KW_TRY(), "try"),
        formatTerminal(node.LBRACE(), "{"),
        visit(node._try_expression),
        formatTerminal(node.RBRACE(), "}"),
        node.catchClause().map((clause) => visit(clause)),
    );
}

export function formatPairConstructor(
    node: PairConstructor,
    visit: Visit,
    formatTerminal: FormatTerminal,
): Doc {
    return concat([visit(node._lhs), formatTerminal(node.COLON(), ":"), space, visit(node._rhs)]);
}

export function formatPredicate(
    node: Predicate,
    visit: Visit,
    formatTerminal: FormatTerminal,
): Doc {
    return concat([
        formatTerminal(node.LBRACKET(), "["),
        visit(node.expr()),
        formatTerminal(node.RBRACKET(), "]"),
    ]);
}

export function formatVariableName(
    node: VariableName,
    visit: Visit,
    formatTerminal: FormatTerminal,
): Doc {
    return concat([formatTerminal(node.DOLLAR(), "$"), visit(node._var_name)]);
}

export function formatEnclosedExpression(
    node: EnclosedExpression,
    visit: Visit,
    formatTerminal: FormatTerminal,
): Doc {
    return formatBlockDoc(
        formatTerminal(node.LBRACE(), "{"),
        visit(node.expr()),
        formatTerminal(node.RBRACE(), "}"),
    );
}

export function formatSequenceType(
    node: SequenceType,
    visit: Visit,
    formatTerminal: FormatTerminal,
): Doc {
    if (node.KW_EMPTY_SEQUENCE() !== null) {
        return concat([
            formatTerminal(node.KW_EMPTY_SEQUENCE(), "empty-sequence"),
            formatTerminal(node.LPAREN(), "("),
            formatTerminal(node.RPAREN(), ")"),
        ]);
    }

    let occurrence: Doc = NIL;
    if (node._question && node._question.length > 0) {
        occurrence = formatTerminal(node.QUESTION(), "?");
    } else if (node._star && node._star.length > 0) {
        occurrence = formatTerminal(node.STAR(), "*");
    } else if (node._plus && node._plus.length > 0) {
        occurrence = formatTerminal(node.PLUS(), "+");
    }
    return concat([visit(node._item), occurrence]);
}

export function formatCatchClause(
    node: CatchClause,
    visit: Visit,
    formatTerminal: FormatTerminal,
): Doc {
    let target: Doc = NIL;
    if (node._catch_var) {
        target = concat([
            space,
            formatTerminal(node.LPAREN(), "("),
            visit(node._catch_var),
            formatTerminal(node.RPAREN(), ")"),
        ]);
    } else {
        const targets = [...(node._jokers ?? []), ...(node._errors ?? [])].map((item) =>
            visit(item),
        );
        if (targets.length > 0) {
            target = concat([
                space,
                formatTokenSeparatedDocs(
                    targets,
                    node.VBAR(),
                    (bar) => concat([space, formatTerminal(bar, "|")]),
                    space,
                ),
            ]);
        }
    }

    const body = formatBlockDoc(
        formatTerminal(node.LBRACE(), "{"),
        visit(node._catch_expression),
        formatTerminal(node.RBRACE(), "}"),
    );
    return concat([formatTerminal(node.KW_CATCH(), "catch"), target, space, body]);
}

export function formatSwitchExpression(
    node: SwitchExpression,
    visit: Visit,
    formatTerminal: FormatTerminal,
): Doc {
    const defaultClause = group(
        concat([
            formatTerminal(node.KW_DEFAULT(), "default"),
            space,
            formatTerminal(node.KW_RETURN(), "return"),
            space,
            indent(concat([softline, visit(node._def)])),
        ]),
    );
    return group(
        concat([
            formatTerminal(node.KW_SWITCH(), "switch"),
            space,
            formatTerminal(node.LPAREN(), "("),
            visit(node._cond),
            formatTerminal(node.RPAREN(), ")"),
            indent(
                concat([
                    hardline,
                    join(
                        hardline,
                        node.switchCaseClause().map((clause) => visit(clause)),
                    ),
                    hardline,
                    defaultClause,
                ]),
            ),
        ]),
    );
}

export function formatSwitchCaseClause(
    node: SwitchCaseClause,
    visit: Visit,
    formatTerminal: FormatTerminal,
): Doc {
    const caseTokens = node.KW_CASE();
    const cases = (node._cond ?? []).map((condition, index) =>
        concat([formatTerminal(caseTokens[index], "case"), space, visit(condition)]),
    );
    return group(
        concat([
            join(space, cases),
            space,
            formatTerminal(node.KW_RETURN(), "return"),
            space,
            indent(concat([softline, visit(node._ret)])),
        ]),
    );
}

export function formatTypeswitchExpression(
    node: TypeswitchExpression,
    visit: Visit,
    formatTerminal: FormatTerminal,
): Doc {
    const defaultVariable = node._var_ref ? concat([space, visit(node._var_ref)]) : NIL;
    const defaultClause = group(
        concat([
            formatTerminal(node.KW_DEFAULT(), "default"),
            defaultVariable,
            space,
            formatTerminal(node.KW_RETURN(), "return"),
            space,
            indent(concat([softline, visit(node._def)])),
        ]),
    );
    return group(
        concat([
            formatTerminal(node.KW_TYPESWITCH(), "typeswitch"),
            space,
            formatTerminal(node.LPAREN(), "("),
            visit(node._cond),
            formatTerminal(node.RPAREN(), ")"),
            indent(
                concat([
                    hardline,
                    join(
                        hardline,
                        node.caseClause().map((clause) => visit(clause)),
                    ),
                    hardline,
                    defaultClause,
                ]),
            ),
        ]),
    );
}

export function formatCaseClause(
    node: CaseClause,
    visit: Visit,
    formatTerminal: FormatTerminal,
): Doc {
    const variable = node._var_ref
        ? concat([visit(node._var_ref), space, formatTerminal(node.KW_AS(), "as"), space])
        : NIL;
    const unionTypes = formatTokenSeparatedDocs(
        (node._union ?? []).map((type) => visit(type)),
        node.VBAR(),
        (bar) => concat([space, formatTerminal(bar, "|")]),
        space,
    );
    return group(
        concat([
            formatTerminal(node.KW_CASE(), "case"),
            space,
            variable,
            unionTypes,
            space,
            formatTerminal(node.KW_RETURN(), "return"),
            space,
            indent(concat([softline, visit(node._ret)])),
        ]),
    );
}

export function formatFlworExpression(
    node: FlworExpression,
    visit: Visit,
    formatTerminal: FormatTerminal,
): Doc {
    const clauses: Doc[] = [];
    for (let index = 0; index < node.getChildCount(); index++) {
        const child = node.getChild(index);
        if (child === null || child === node.KW_RETURN() || child === node._return_expr) {
            continue;
        }
        const clause = visit(child);
        if (clause.kind !== "text" || clause.text !== "") {
            clauses.push(clause);
        }
    }
    return group(
        formatFlworExpressionDoc(
            clauses,
            formatTerminal(node.KW_RETURN(), "return"),
            visit(node._return_expr),
        ),
    );
}

function formatCommaSeparatedChildren(
    node: ParserRuleContext,
    items: readonly ParseTree[],
    commaTokenType: number,
    visit: Visit,
    formatTerminal: FormatTerminal,
): Doc {
    return formatTokenSeparatedDocs(
        items.map((item) => visit(item)),
        node.getTokens(commaTokenType),
        (comma) => formatTerminal(comma, ","),
    );
}

export function formatForClause(
    node: ForClause,
    commaTokenType: number,
    visit: Visit,
    formatTerminal: FormatTerminal,
): Doc {
    return group(
        concat([
            formatTerminal(node.KW_FOR(), "for"),
            space,
            formatCommaSeparatedChildren(node, node._vars, commaTokenType, visit, formatTerminal),
        ]),
    );
}

export function formatForVariable(
    node: ForVariable,
    visit: Visit,
    formatTerminal: FormatTerminal,
): Doc {
    const sequenceType = node._seq
        ? concat([space, formatTerminal(node.KW_AS(), "as"), space, visit(node._seq)])
        : NIL;
    const allowingEmpty = node.allowingEmpty() ? concat([space, visit(node.allowingEmpty())]) : NIL;
    const positionalVariable = node._at
        ? concat([space, formatTerminal(node.KW_AT(), "at"), space, visit(node._at)])
        : NIL;
    return concat([
        visit(node._var_ref),
        sequenceType,
        allowingEmpty,
        positionalVariable,
        space,
        formatTerminal(node.KW_IN(), "in"),
        space,
        visit(node._ex),
    ]);
}

export function formatLetClause(
    node: LetClause,
    commaTokenType: number,
    visit: Visit,
    formatTerminal: FormatTerminal,
): Doc {
    return group(
        concat([
            formatTerminal(node.KW_LET(), "let"),
            space,
            formatCommaSeparatedChildren(node, node._vars, commaTokenType, visit, formatTerminal),
        ]),
    );
}

export function formatLetVariable(
    node: LetVariable,
    visit: Visit,
    formatTerminal: FormatTerminal,
): Doc {
    const sequenceType = node._seq
        ? concat([space, formatTerminal(node.KW_AS(), "as"), space, visit(node._seq)])
        : NIL;
    return concat([
        visit(node._var_ref),
        sequenceType,
        space,
        formatTerminal(node.COLON_EQ(), ":="),
        space,
        visit(node._ex),
    ]);
}

export function formatWhereClause(
    node: WhereClause,
    visit: Visit,
    formatTerminal: FormatTerminal,
): Doc {
    return concat([formatTerminal(node.KW_WHERE(), "where"), space, visit(node.exprSingle())]);
}

export function formatGroupByClause(
    node: GroupByClause,
    commaTokenType: number,
    visit: Visit,
    formatTerminal: FormatTerminal,
): Doc {
    return group(
        concat([
            formatTerminal(node.KW_GROUP(), "group"),
            space,
            formatTerminal(node.KW_BY(), "by"),
            space,
            formatCommaSeparatedChildren(node, node._vars, commaTokenType, visit, formatTerminal),
        ]),
    );
}

export function formatGroupByVariable(
    node: GroupByVariable,
    visit: Visit,
    formatTerminal: FormatTerminal,
): Doc {
    const sequenceType = node._seq
        ? concat([space, formatTerminal(node.KW_AS(), "as"), space, visit(node._seq)])
        : NIL;
    const expression = node._ex
        ? concat([space, formatTerminal(node.COLON_EQ(), ":="), space, visit(node._ex)])
        : NIL;
    return concat([visit(node._var_ref), sequenceType, expression]);
}

export function formatOrderByClause(
    node: OrderByClause,
    commaTokenType: number,
    visit: Visit,
    formatTerminal: FormatTerminal,
): Doc {
    const stable = node.KW_STABLE()
        ? concat([formatTerminal(node.KW_STABLE(), "stable"), space])
        : NIL;
    return group(
        concat([
            stable,
            formatTerminal(node.KW_ORDER(), "order"),
            space,
            formatTerminal(node.KW_BY(), "by"),
            space,
            formatCommaSeparatedChildren(node, node._specs, commaTokenType, visit, formatTerminal),
        ]),
    );
}

export function formatCountClause(
    node: CountClause,
    visit: Visit,
    formatTerminal: FormatTerminal,
): Doc {
    return concat([formatTerminal(node.KW_COUNT(), "count"), space, visit(node.varBinding())]);
}

export function formatExpressionSequence(
    node: ExpressionSequence,
    commaTokenType: number,
    visit: Visit,
    formatTerminal: FormatTerminal,
): Doc {
    return group(
        formatCommaSeparatedChildren(
            node,
            node.exprSingle(),
            commaTokenType,
            visit,
            formatTerminal,
        ),
    );
}
