import { ParserRuleContext, TerminalNode, type ParseTree, type Token } from "antlr4ng";
import type * as jsoniq from "server/parser/adapters/jsoniq/grammar/JsoniqParser.js";
import type * as xquery from "server/parser/adapters/xquery/grammar/XQueryParser.js";

import type { FormatterContext } from "../context.js";
import {
    concat,
    type Doc,
    group,
    hardline,
    indent,
    join,
    NIL,
    softline,
    space,
    spacedDocs,
} from "../doc.js";
import { formatBlockDoc, formatIfExpressionDoc, formatTryCatchDoc } from "../helpers.js";
import { formatTokenSeparatedDocs } from "./tokens.js";

type SourceTerminal = TerminalNode | TerminalNode[] | Token | null | undefined;
type FormatTerminal = (terminal: SourceTerminal, expectedToken: number | string) => Doc;
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
type LibraryModule = jsoniq.LibraryModuleContext | xquery.LibraryModuleContext;
type MainModule = jsoniq.MainModuleContext | xquery.MainModuleContext;
type Prolog = jsoniq.PrologContext | xquery.PrologContext;
type AnnotatedDeclaration = jsoniq.AnnotatedDeclContext | xquery.AnnotatedDeclContext;
type ParameterList = jsoniq.ParamListContext | xquery.ParamListContext;
type Parameter = jsoniq.ParamContext | xquery.ParamContext;
type Annotations = jsoniq.AnnotationsContext | xquery.AnnotationsContext;
type Annotation = jsoniq.AnnotationContext | xquery.AnnotationContext;

type QueryModule = jsoniq.ModuleContext | xquery.ModuleContext;

interface PrologRuleTypes {
    readonly RULE_moduleImport: number;
    readonly RULE_schemaImport: number;
    readonly RULE_defaultNamespaceDecl: number;
    readonly RULE_namespaceDecl: number;
    readonly RULE_setter: number;
    readonly RULE_functionDecl: number;
    readonly RULE_varDecl: number;
    readonly RULE_typeDecl?: number;
    readonly RULE_contextItemDecl: number;
    readonly RULE_optionDecl: number;
}

type DeclarationType =
    | "import"
    | "namespace"
    | "setter"
    | "function"
    | "variable"
    | "type"
    | "context"
    | "option"
    | "other";

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

export function formatProlog(
    context: FormatterContext,
    node: Prolog,
    rules: PrologRuleTypes,
    visit: Visit,
): Doc {
    const declarations: { doc: Doc; type: DeclarationType }[] = [];
    for (let index = 0; index < node.getChildCount(); index++) {
        const child = node.getChild(index);
        if (child === null || child instanceof TerminalNode) {
            continue;
        }
        const declaration = visit(child);
        if (declaration.kind !== "text" || declaration.text !== "") {
            declarations.push({ doc: declaration, type: findDeclarationType(child, rules) });
        }
    }
    if (declarations.length === 0) {
        return NIL;
    }

    const docs: Doc[] = [declarations[0]!.doc];
    for (let index = 1; index < declarations.length; index++) {
        const previous = declarations[index - 1]!;
        const current = declarations[index]!;
        docs.push(
            context.options.blankLineBetweenDeclarations && previous.type !== current.type
                ? concat([hardline, hardline])
                : hardline,
            current.doc,
        );
    }
    return concat(docs);
}

function findDeclarationType(node: ParseTree, rules: PrologRuleTypes): DeclarationType {
    if (node instanceof ParserRuleContext) {
        const rule = node.ruleIndex;
        if (rule === rules.RULE_moduleImport || rule === rules.RULE_schemaImport) {
            return "import";
        }
        if (rule === rules.RULE_defaultNamespaceDecl || rule === rules.RULE_namespaceDecl) {
            return "namespace";
        }
        if (rule === rules.RULE_setter) {
            return "setter";
        }
        if (rule === rules.RULE_functionDecl) {
            return "function";
        }
        if (rule === rules.RULE_varDecl) {
            return "variable";
        }
        if (rules.RULE_typeDecl !== undefined && rule === rules.RULE_typeDecl) {
            return "type";
        }
        if (rule === rules.RULE_contextItemDecl) {
            return "context";
        }
        if (rule === rules.RULE_optionDecl) {
            return "option";
        }
    }
    for (let index = 0; index < node.getChildCount(); index++) {
        const child = node.getChild(index);
        if (child && !(child instanceof TerminalNode)) {
            const type = findDeclarationType(child, rules);
            if (type !== "other") {
                return type;
            }
        }
    }
    return "other";
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
    const targets = node.catchErrorTarget().map(visit);
    const target = concat([
        space,
        formatTokenSeparatedDocs(
            targets,
            node.VBAR(),
            (bar) => concat([space, formatTerminal(bar, "|")]),
            space,
        ),
    ]);

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
