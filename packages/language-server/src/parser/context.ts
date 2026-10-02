import type * as jsoniq from "./adapters/jsoniq/grammar/JsoniqParser.js";
import type * as xquery from "./adapters/xquery/grammar/XQueryParser.js";

/** Shared CST types. A node belongs to either grammar, so these are unions. */
export type AnnotatedDeclContext = jsoniq.AnnotatedDeclContext | xquery.AnnotatedDeclContext;
export type AnnotationContext = jsoniq.AnnotationContext | xquery.AnnotationContext;
export type AnnotationsContext = jsoniq.AnnotationsContext | xquery.AnnotationsContext;
export type ApplyStatementContext = jsoniq.ApplyStatementContext | xquery.ApplyStatementContext;
export type ArgumentContext = jsoniq.ArgumentContext | xquery.ArgumentContext;
export type ArgumentListContext = jsoniq.ArgumentListContext | xquery.ArgumentListContext;
export type AssignStatementContext = jsoniq.AssignStatementContext | xquery.AssignStatementContext;
export type BaseURIDeclContext = jsoniq.BaseURIDeclContext | xquery.BaseURIDeclContext;
export type BlockExprContext = jsoniq.BlockExprContext | xquery.BlockExprContext;
export type BlockStatementContext = jsoniq.BlockStatementContext | xquery.BlockStatementContext;
export type BoundarySpaceDeclContext =
    | jsoniq.BoundarySpaceDeclContext
    | xquery.BoundarySpaceDeclContext;
export type BreakStatementContext = jsoniq.BreakStatementContext | xquery.BreakStatementContext;
export type CaseClauseContext = jsoniq.CaseClauseContext | xquery.CaseClauseContext;
export type CaseStatementContext = jsoniq.CaseStatementContext | xquery.CaseStatementContext;
export type CatchCaseStatementContext =
    | jsoniq.CatchCaseStatementContext
    | xquery.CatchCaseStatementContext;
export type CatchClauseContext = jsoniq.CatchClauseContext | xquery.CatchClauseContext;
export type ContextItemDeclContext = jsoniq.ContextItemDeclContext | xquery.ContextItemDeclContext;
export type ContextItemExprContext = jsoniq.ContextItemExprContext | xquery.ContextItemExprContext;
export type ContinueStatementContext =
    | jsoniq.ContinueStatementContext
    | xquery.ContinueStatementContext;
export type CopyDeclContext = jsoniq.CopyDeclContext | xquery.CopyDeclContext;
export type CountClauseContext = jsoniq.CountClauseContext | xquery.CountClauseContext;
export type CurlyArrayConstructorContext =
    | jsoniq.CurlyArrayConstructorContext
    | xquery.CurlyArrayConstructorContext;
export type DefaultNamespaceDeclContext =
    | jsoniq.DefaultNamespaceDeclContext
    | xquery.DefaultNamespaceDeclContext;
export type DirectConstructorContext =
    | jsoniq.DirectConstructorContext
    | xquery.DirectConstructorContext;
export type EnclosedExpressionContext =
    | jsoniq.EnclosedExpressionContext
    | xquery.EnclosedExpressionContext;
export type ExitStatementContext = jsoniq.ExitStatementContext | xquery.ExitStatementContext;
export type ExprContext = jsoniq.ExprContext | xquery.ExprContext;
export type FlworExprContext = jsoniq.FlworExprContext | xquery.FlworExprContext;
export type FlworStatementContext = jsoniq.FlworStatementContext | xquery.FlworStatementContext;
export type ForClauseContext = jsoniq.ForClauseContext | xquery.ForClauseContext;
export type ForVarContext = jsoniq.ForVarContext | xquery.ForVarContext;
export type FunctionCallContext = jsoniq.FunctionCallContext | xquery.FunctionCallContext;
export type FunctionDeclContext = jsoniq.FunctionDeclContext | xquery.FunctionDeclContext;
export type GroupByClauseContext = jsoniq.GroupByClauseContext | xquery.GroupByClauseContext;
export type GroupByVarContext = jsoniq.GroupByVarContext | xquery.GroupByVarContext;
export type IfExprContext = jsoniq.IfExprContext | xquery.IfExprContext;
export type IfStatementContext = jsoniq.IfStatementContext | xquery.IfStatementContext;
export type InlineFunctionExprContext =
    | jsoniq.InlineFunctionExprContext
    | xquery.InlineFunctionExprContext;
export type LetClauseContext = jsoniq.LetClauseContext | xquery.LetClauseContext;
export type LetVarContext = jsoniq.LetVarContext | xquery.LetVarContext;
export type LibraryModuleContext = jsoniq.LibraryModuleContext | xquery.LibraryModuleContext;
export type MainModuleContext = jsoniq.MainModuleContext | xquery.MainModuleContext;
export type ModuleAndThisIsItContext =
    | jsoniq.ModuleAndThisIsItContext
    | xquery.ModuleAndThisIsItContext;
export type ModuleContext = jsoniq.ModuleContext | xquery.ModuleContext;
export type ModuleImportContext = jsoniq.ModuleImportContext | xquery.ModuleImportContext;
export type NameTestContext = jsoniq.NameTestContext | xquery.NameTestContext;
export type NamedFunctionRefContext =
    | jsoniq.NamedFunctionRefContext
    | xquery.NamedFunctionRefContext;
export type NamespaceDeclContext = jsoniq.NamespaceDeclContext | xquery.NamespaceDeclContext;
export type OrderByClauseContext = jsoniq.OrderByClauseContext | xquery.OrderByClauseContext;
export type PairConstructorContext = jsoniq.PairConstructorContext | xquery.PairConstructorContext;
export type ParamContext = jsoniq.ParamContext | xquery.ParamContext;
export type ParamListContext = jsoniq.ParamListContext | xquery.ParamListContext;
export type ParenthesizedExprContext =
    | jsoniq.ParenthesizedExprContext
    | xquery.ParenthesizedExprContext;
export type PostfixExprContext = jsoniq.PostfixExprContext | xquery.PostfixExprContext;
export type PredicateContext = jsoniq.PredicateContext | xquery.PredicateContext;
export type ProgramContext = jsoniq.ProgramContext | xquery.ProgramContext;
export type PrologContext = jsoniq.PrologContext | xquery.PrologContext;
export type QuantifiedExprVarContext =
    | jsoniq.QuantifiedExprVarContext
    | xquery.QuantifiedExprVarContext;
export type SchemaImportContext = jsoniq.SchemaImportContext | xquery.SchemaImportContext;
export type SequenceTypeContext = jsoniq.SequenceTypeContext | xquery.SequenceTypeContext;
export type SlidingWindowClauseContext =
    | jsoniq.SlidingWindowClauseContext
    | xquery.SlidingWindowClauseContext;
export type SquareArrayConstructorContext =
    | jsoniq.SquareArrayConstructorContext
    | xquery.SquareArrayConstructorContext;
export type StatementContext = jsoniq.StatementContext | xquery.StatementContext;
export type StatementsAndExprContext =
    | jsoniq.StatementsAndExprContext
    | xquery.StatementsAndExprContext;
export type StatementsAndOptionalExprContext =
    | jsoniq.StatementsAndOptionalExprContext
    | xquery.StatementsAndOptionalExprContext;
export type StatementsContext = jsoniq.StatementsContext | xquery.StatementsContext;
export type StringConstructorContext =
    | jsoniq.StringConstructorContext
    | xquery.StringConstructorContext;
export type StringLiteralContext = jsoniq.StringLiteralContext | xquery.StringLiteralContext;
export type SwitchCaseClauseContext =
    | jsoniq.SwitchCaseClauseContext
    | xquery.SwitchCaseClauseContext;
export type SwitchCaseStatementContext =
    | jsoniq.SwitchCaseStatementContext
    | xquery.SwitchCaseStatementContext;
export type SwitchExprContext = jsoniq.SwitchExprContext | xquery.SwitchExprContext;
export type SwitchStatementContext = jsoniq.SwitchStatementContext | xquery.SwitchStatementContext;
export type TransformExprContext = jsoniq.TransformExprContext | xquery.TransformExprContext;
export type TryCatchExprContext = jsoniq.TryCatchExprContext | xquery.TryCatchExprContext;
export type TryCatchStatementContext =
    | jsoniq.TryCatchStatementContext
    | xquery.TryCatchStatementContext;
export type TumblingWindowClauseContext =
    | jsoniq.TumblingWindowClauseContext
    | xquery.TumblingWindowClauseContext;
export type TypeSwitchStatementContext =
    | jsoniq.TypeSwitchStatementContext
    | xquery.TypeSwitchStatementContext;
export type TypeswitchExprContext = jsoniq.TypeswitchExprContext | xquery.TypeswitchExprContext;
export type UriLiteralContext = jsoniq.UriLiteralContext | xquery.UriLiteralContext;
export type VarBindingContext = jsoniq.VarBindingContext | xquery.VarBindingContext;
export type VarDeclContext = jsoniq.VarDeclContext | xquery.VarDeclContext;
export type VarDeclForStatementContext =
    | jsoniq.VarDeclForStatementContext
    | xquery.VarDeclForStatementContext;
export type VarDeclStatementContext =
    | jsoniq.VarDeclStatementContext
    | xquery.VarDeclStatementContext;
export type VarRefContext = jsoniq.VarRefContext | xquery.VarRefContext;
export type WhereClauseContext = jsoniq.WhereClauseContext | xquery.WhereClauseContext;
export type WhileStatementContext = jsoniq.WhileStatementContext | xquery.WhileStatementContext;
export type WindowEndConditionContext =
    | jsoniq.WindowEndConditionContext
    | xquery.WindowEndConditionContext;
export type WindowStartConditionContext =
    | jsoniq.WindowStartConditionContext
    | xquery.WindowStartConditionContext;
export type WindowVarsContext = jsoniq.WindowVarsContext | xquery.WindowVarsContext;

export type VariableNameContext = VarRefContext | VarBindingContext;
