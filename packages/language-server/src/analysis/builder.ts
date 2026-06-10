import { parseDocument } from "server/parser/index.js";
import type {
    AstBinding,
    AstParameter,
    CatchClauseAstNode,
    ContextItemDeclarationAstNode,
    ContextItemExpressionAstNode,
    CountClauseAstNode,
    FlowrExpressionAstNode,
    ForBindingAstNode,
    FunctionCallAstNode,
    FunctionDeclarationAstNode,
    GroupByBindingAstNode,
    LetBindingAstNode,
    NamespaceDeclarationAstNode,
    NamedFunctionReferenceAstNode,
    ReferenceAstNode,
    TypeDeclarationAstNode,
    VariableDeclarationAstNode,
    VariableReferenceAstNode,
} from "server/parser/types/ast.js";
import {
    isPrefixedQName,
    type LexicalFunctionName,
    type LexicalQName,
    type LexicalReferenceNameByKind,
    type LexicalVarName,
} from "server/parser/types/name.js";
import { AstVisitor } from "server/parser/types/visitor.js";
import { comparePositions } from "server/utils/position.js";
import { BuiltinFunctions } from "server/wrapper/builtin-functions.js";
import { DiagnosticSeverity, Position, Range } from "vscode-languageserver";
import { TextDocument } from "vscode-languageserver-textdocument";

import { defaultNamespaces } from "./default-namespaces.js";
import {
    createFunctionDefinition,
    createNamespaceDefinition,
    createParameterDefinition,
    createTypeDefinition,
    createVariableDefinition,
} from "./definitions.js";
import {
    type AnyReference,
    type Definition,
    type JsoniqAnalysis,
    type ResolvedReference,
    type SourceDefinition,
    type SourceFunctionDefinition,
    type SourceNamespaceDefinition,
    type VariableKind,
    isSourceDefinition,
} from "./model.js";
import {
    resolvedReferenceNameToString,
    type ResolvedFunctionName,
    type ResolvedQName,
    type ResolvedReferenceNameByKind,
    type ResolvedVarName,
} from "./names.js";
import { Scope } from "./scope.js";

type LexicalReference<
    K extends keyof LexicalReferenceNameByKind = keyof LexicalReferenceNameByKind,
> = K extends keyof LexicalReferenceNameByKind
    ? {
          kind: K;
          name: LexicalReferenceNameByKind[K];
          range: AnyReference["range"];
      }
    : never;

const CATCH_VARIABLES = [
    { qname: { kind: "prefixed-qname", prefix: "err", localName: "code" } },
    { qname: { kind: "prefixed-qname", prefix: "err", localName: "description" } },
    { qname: { kind: "prefixed-qname", prefix: "err", localName: "value" } },
    { qname: { kind: "prefixed-qname", prefix: "err", localName: "module" } },
    { qname: { kind: "prefixed-qname", prefix: "err", localName: "line-number" } },
    { qname: { kind: "prefixed-qname", prefix: "err", localName: "column-number" } },
    { qname: { kind: "prefixed-qname", prefix: "err", localName: "additional" } },
] as const;

class AnalysisBuilder extends AstVisitor {
    private static readonly NEVER_VISIBLE_OFFSET = Number.POSITIVE_INFINITY;

    private readonly analysis: JsoniqAnalysis;

    private currentScope: Scope;

    private readonly document: TextDocument;

    private readonly builtinFunctions: BuiltinFunctions;

    public constructor(document: TextDocument, builtinFunctions: BuiltinFunctions) {
        super();
        this.document = document;
        this.builtinFunctions = builtinFunctions;

        const ast = parseDocument(document).ast;
        const namespaces = new Map<string, SourceNamespaceDefinition>(
            defaultNamespaces.entries().map((ns) => {
                const definition = createNamespaceDefinition(
                    document,
                    ns[0],
                    ns[1],
                    Range.create(Position.create(0, 0), Position.create(0, 0)),
                    Range.create(Position.create(0, 0), Position.create(0, 0)),
                );
                return [ns[0], definition] as const;
            }),
        );

        this.analysis = {
            ast,
            moduleScope: Scope.module(document, namespaces),
            namespaces,
            definitions: [],
            references: [],
            diagnostics: [],
            symbolIndex: [],
        };

        this.currentScope = this.analysis.moduleScope;
    }

    public build(): JsoniqAnalysis {
        this.visit(this.analysis.ast);

        this.analysis.symbolIndex.sort((left, right) => {
            const startComparison = comparePositions(left.range.start, right.range.start);
            if (startComparison !== 0) {
                return startComparison;
            }

            return comparePositions(left.range.end, right.range.end);
        });

        this.analysis.definitions.sort((left, right) =>
            comparePositions(left.range.start, right.range.start),
        );

        return this.analysis;
    }

    protected override visitNamespaceDeclaration(node: NamespaceDeclarationAstNode): void {
        const definition = createNamespaceDefinition(
            this.document,
            node.prefix,
            node.namespaceUri,
            node.range,
            node.selectionRange,
        );
        this.recordDefinition(definition);
        this.analysis.namespaces.set(definition.name.prefix, definition);
    }

    protected override visitContextItemDeclaration(node: ContextItemDeclarationAstNode): void {
        this.recordDefinition(
            createVariableDefinition(
                this.document,
                "declare-variable",
                this.normalizeVarName(node.name, node.selectionRange),
                node.range,
                node.selectionRange,
            ),
        );
    }

    protected override visitTypeDeclaration(node: TypeDeclarationAstNode): void {
        this.recordDefinition(
            createTypeDefinition(
                this.document,
                { qname: this.normalizeQName(node.name.qname, node.selectionRange) },
                node.range,
                node.selectionRange,
            ),
        );
    }

    protected override visitFunctionDeclaration(node: FunctionDeclarationAstNode): void {
        const definition = createFunctionDefinition(
            this.document,
            this.normalizeFunctionName(node.name, node.nameRange),
            node.range,
            node.nameRange,
        );
        this.recordDefinition(definition);
        this.pushScope(node.range.start, node.range.end);
        this.registerFunctionParameters(definition, node.parameters);
        this.visitChildren(node);
        this.popScope();
    }

    protected override visitVariableDeclaration(node: VariableDeclarationAstNode): void {
        const variableDefinition = createVariableDefinition(
            this.document,
            "declare-variable",
            this.normalizeVarName(node.binding.name, node.binding.selectionRange),
            node.binding.range,
            node.binding.selectionRange,
            node.completed
                ? this.document.offsetAt(node.range.end)
                : AnalysisBuilder.NEVER_VISIBLE_OFFSET,
        );
        this.visitChildren(node);
        this.recordDefinition(variableDefinition);
    }

    protected override visitLetBinding(node: LetBindingAstNode): void {
        this.visitChildren(node);
        this.recordDefinition(this.variableDefinition("let", node.binding));
    }

    protected override visitGroupByBinding(node: GroupByBindingAstNode): void {
        this.visitChildren(node);
        this.recordDefinition(this.variableDefinition("group-by", node.binding));
    }

    protected override visitCountClause(node: CountClauseAstNode): void {
        this.visitChildren(node);
        this.recordDefinition(this.variableDefinition("count", node.binding));
    }

    protected override visitForBinding(node: ForBindingAstNode): void {
        this.visitChildren(node);
        for (const binding of node.bindings) {
            this.recordDefinition(this.variableDefinition(binding.bindingKind, binding));
        }
    }

    protected override visitFlowrExpression(node: FlowrExpressionAstNode): void {
        this.visitScopedChildren(node);
    }

    protected override visitCatchClause(node: CatchClauseAstNode): void {
        this.pushScope(node.range.start, node.range.end);
        for (const name of CATCH_VARIABLES) {
            this.recordDefinition(
                createVariableDefinition(
                    this.document,
                    "catch-variable",
                    this.normalizeVarName(name, node.range),
                    node.range,
                    node.range,
                    /// Catch variables are visible inmediate after the catch clause starts
                    this.document.offsetAt(node.range.start),
                ),
            );
        }
        this.visitChildren(node);
        this.popScope();
    }

    protected override visitVariableReference(node: VariableReferenceAstNode): void {
        this.recordReference({
            kind: "variable",
            name: node.name,
            range: node.range,
        });
    }

    protected override visitContextItemExpression(node: ContextItemExpressionAstNode): void {
        this.recordReference({
            kind: "variable",
            name: node.name,
            range: node.range,
        });
    }

    protected override visitFunctionCall(node: FunctionCallAstNode): void {
        this.recordReference({
            kind: "function",
            name: node.name,
            range: node.nameRange,
        });
        this.visitChildren(node);
    }

    protected override visitNamedFunctionReference(node: NamedFunctionReferenceAstNode): void {
        this.recordReference({
            kind: "function",
            name: node.name,
            range: node.nameRange,
        });
        this.visitChildren(node);
    }

    protected override visitReference(node: ReferenceAstNode): void {
        this.recordReference({
            kind: node.referenceKind,
            name: node.name,
            range: node.range,
        });
    }

    private visitScopedChildren(node: FlowrExpressionAstNode) {
        this.pushScope(node.range.start, node.range.end);
        this.visitChildren(node);
        this.popScope();
    }

    private pushScope(start: Position, end: Position): void {
        this.currentScope = this.currentScope.enter(
            this.document.offsetAt(start),
            this.document.offsetAt(end),
        );
    }

    private popScope(): void {
        const parent = this.currentScope.parent;
        if (parent === undefined) {
            throw new Error("Cannot exit the module scope.");
        }
        this.currentScope = parent;
    }

    private recordDefinition(definition: SourceDefinition): void {
        this.analysis.definitions.push(definition);
        this.analysis.symbolIndex.push({
            range: definition.selectionRange,
            declaration: definition,
            reference: undefined,
        });
        this.currentScope.declare(definition);
    }

    private resolve<K extends keyof ResolvedReferenceNameByKind>(
        kind: K,
        name: ResolvedReferenceNameByKind[K],
    ): Definition | undefined {
        if (kind === "function") {
            const builtinDefinition = this.builtinFunctions.find(name);
            if (builtinDefinition !== undefined) {
                return builtinDefinition;
            }
        }

        return this.currentScope.resolve(kind, name);
    }

    private recordReference(reference: LexicalReference) {
        const name =
            reference.kind === "function"
                ? this.normalizeFunctionName(reference.name, reference.range)
                : this.normalizeVarName(reference.name, reference.range);
        const lookupName = resolvedReferenceNameToString(name, reference.kind);
        const declaration = this.resolve(reference.kind, name);
        if (declaration === undefined) {
            this.analysis.diagnostics.push({
                severity: DiagnosticSeverity.Error,
                message: `Reference to undefined variable '${lookupName}'`,
                range: reference.range,
                code: "unresolved-variable",
            });
            return;
        }

        const resolvedReference = {
            ...reference,
            name,
            declaration,
        } satisfies ResolvedReference;

        this.analysis.references.push(resolvedReference);
        this.analysis.symbolIndex.push({
            range: resolvedReference.range,
            declaration,
            reference: resolvedReference,
        });

        if (isSourceDefinition(declaration)) {
            declaration.references.push(resolvedReference);
        }
    }

    private registerFunctionParameters(
        definition: SourceFunctionDefinition,
        parameters: AstParameter[],
    ): void {
        for (const parameter of parameters) {
            const parameterDefinition = createParameterDefinition(
                this.document,
                this.normalizeVarName(parameter.name, parameter.selectionRange),
                parameter.range,
                parameter.selectionRange,
                definition,
            );
            this.recordDefinition(parameterDefinition);
            definition.parameters.push(parameterDefinition);
        }
    }

    private variableDefinition(kind: VariableKind, binding: AstBinding): SourceDefinition {
        return createVariableDefinition(
            this.document,
            kind,
            this.normalizeVarName(binding.name, binding.selectionRange),
            binding.range,
            binding.selectionRange,
            this.document.offsetAt(binding.range.end),
        );
    }

    private normalizeFunctionName(name: LexicalFunctionName, range: Range): ResolvedFunctionName {
        return {
            ...name,
            qname: this.normalizeQName(name.qname, range),
        };
    }

    private normalizeVarName(name: LexicalVarName, range: Range): ResolvedVarName {
        return {
            ...name,
            qname: this.normalizeQName(name.qname, range),
        };
    }

    private normalizeQName(qname: LexicalQName, range: Range): ResolvedQName {
        const namespaceUri = isPrefixedQName(qname)
            ? this.analysis.namespaces.get(qname.prefix)?.namespaceUri
            : undefined;

        if (namespaceUri === undefined && isPrefixedQName(qname)) {
            this.analysis.diagnostics.push({
                severity: DiagnosticSeverity.Warning,
                message: `Undefined namespace prefix '${qname.prefix}'`,
                range,
                code: "undefined-namespace-prefix",
            });
        }

        return {
            localName: qname.localName,
            ...(namespaceUri === undefined ? {} : { namespaceUri }),
            ...(isPrefixedQName(qname) ? { prefix: qname.prefix } : {}),
        };
    }
}

export function buildAnalysis(
    document: TextDocument,
    builtinFunctions: BuiltinFunctions = { all: [], find: () => undefined },
): JsoniqAnalysis {
    return new AnalysisBuilder(document, builtinFunctions).build();
}
