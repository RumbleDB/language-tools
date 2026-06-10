import { parseDocument } from "server/parser/index.js";
import type {
    ArgumentAstNode,
    AstBinding,
    AstNode as ParserAstNode,
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
import { BuiltinFunctions } from "server/wrapper/builtin-functions.js";
import { DiagnosticSeverity, Position, Range } from "vscode-languageserver";
import { TextDocument } from "vscode-languageserver-textdocument";

import type {
    ArgumentNode,
    AstNode,
    DeclarationNode,
    FunctionCallNode,
    ReferenceNode,
} from "./ast.js";
import { defaultNamespaces } from "./default-namespaces.js";
import {
    createFunctionDefinition,
    createNamespaceDefinition,
    createParameterDefinition,
    createTypeDefinition,
    createVariableDefinition,
} from "./definitions.js";
import {
    resolvedReferenceNameToString,
    type ResolvedFunctionName,
    type ResolvedQName,
    type ResolvedReferenceNameByKind,
    type ResolvedVarName,
} from "./names.js";
import { Scope } from "./scope.js";
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
} from "./types.js";

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

class AnalysisBuilder extends AstVisitor<AstNode[]> {
    private static readonly NEVER_VISIBLE_OFFSET = Number.POSITIVE_INFINITY;

    private readonly analysis: JsoniqAnalysis;

    private currentScope: Scope;

    private readonly document: TextDocument;

    private readonly builtinFunctions: BuiltinFunctions;

    private readonly parserAst: ParserAstNode;

    public constructor(document: TextDocument, builtinFunctions: BuiltinFunctions) {
        super();
        this.document = document;
        this.builtinFunctions = builtinFunctions;

        this.parserAst = parseDocument(document).ast;
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
        const moduleScope = Scope.module(document, namespaces);

        this.analysis = {
            ast: {
                kind: "module",
                range: this.parserAst.range,
                children: [],
            },
            scope: moduleScope,
            namespaces,
            diagnostics: [],
        };

        this.currentScope = moduleScope;
    }

    public build(): JsoniqAnalysis {
        this.adoptChildren(this.analysis.ast, this.visitChildrenAsNodes(this.parserAst));
        return this.analysis;
    }

    protected override defaultVisit(node: ParserAstNode): AstNode[] {
        return this.visitChildrenAsNodes(node);
    }

    protected override visitNamespaceDeclaration(node: NamespaceDeclarationAstNode): AstNode[] {
        const definition = createNamespaceDefinition(
            this.document,
            node.prefix,
            node.namespaceUri,
            node.range,
            node.selectionRange,
        );
        this.declareDefinition(definition);
        this.analysis.namespaces.set(definition.name.prefix, definition);
        return [this.createDeclarationNode(definition)];
    }

    protected override visitContextItemDeclaration(node: ContextItemDeclarationAstNode): AstNode[] {
        const definition = createVariableDefinition(
            this.document,
            "declare-variable",
            this.normalizeVarName(node.name, node.selectionRange),
            node.range,
            node.selectionRange,
        );
        this.declareDefinition(definition);
        return [this.createDeclarationNode(definition)];
    }

    protected override visitTypeDeclaration(node: TypeDeclarationAstNode): AstNode[] {
        const definition = createTypeDefinition(
            this.document,
            { qname: this.normalizeQName(node.name.qname, node.selectionRange) },
            node.range,
            node.selectionRange,
        );
        this.declareDefinition(definition);
        return [this.createDeclarationNode(definition)];
    }

    protected override visitFunctionDeclaration(node: FunctionDeclarationAstNode): AstNode[] {
        const definition = createFunctionDefinition(
            this.document,
            this.normalizeFunctionName(node.name, node.nameRange),
            node.range,
            node.nameRange,
        );
        this.declareDefinition(definition);

        const children = this.enterScope(node.range, () => [
            ...this.createFunctionParameterNodes(definition, node.parameters),
            ...this.visitChildrenAsNodes(node),
        ]);

        return [this.createDeclarationNode(definition, children)];
    }

    protected override visitVariableDeclaration(node: VariableDeclarationAstNode): AstNode[] {
        const definition = createVariableDefinition(
            this.document,
            "declare-variable",
            this.normalizeVarName(node.binding.name, node.binding.selectionRange),
            node.binding.range,
            node.binding.selectionRange,
            node.completed
                ? this.document.offsetAt(node.range.end)
                : AnalysisBuilder.NEVER_VISIBLE_OFFSET,
        );
        const children = this.visitChildrenAsNodes(node);
        this.declareDefinition(definition);
        return [this.createDeclarationNode(definition, children)];
    }

    protected override visitLetBinding(node: LetBindingAstNode): AstNode[] {
        return this.visitBindingDeclaration("let", node.binding, () =>
            this.visitChildrenAsNodes(node),
        );
    }

    protected override visitGroupByBinding(node: GroupByBindingAstNode): AstNode[] {
        return this.visitBindingDeclaration("group-by", node.binding, () =>
            this.visitChildrenAsNodes(node),
        );
    }

    protected override visitCountClause(node: CountClauseAstNode): AstNode[] {
        return this.visitBindingDeclaration("count", node.binding, () =>
            this.visitChildrenAsNodes(node),
        );
    }

    protected override visitForBinding(node: ForBindingAstNode): AstNode[] {
        const children = this.visitChildrenAsNodes(node);
        const declarations = node.bindings.map((binding) => {
            const definition = this.variableDefinition(binding.bindingKind, binding);
            this.declareDefinition(definition);
            return this.createDeclarationNode(definition);
        });
        return [...children, ...declarations];
    }

    protected override visitFlowrExpression(node: FlowrExpressionAstNode): AstNode[] {
        return this.enterScope(node.range, () => this.visitChildrenAsNodes(node));
    }

    protected override visitCatchClause(node: CatchClauseAstNode): AstNode[] {
        return this.enterScope(node.range, () => {
            const declarations = CATCH_VARIABLES.map((name) => {
                const definition = createVariableDefinition(
                    this.document,
                    "catch-variable",
                    this.normalizeVarName(name, node.range),
                    node.range,
                    node.range,
                    this.document.offsetAt(node.range.start),
                );
                this.declareDefinition(definition);
                return this.createDeclarationNode(definition);
            });
            return [...declarations, ...this.visitChildrenAsNodes(node)];
        });
    }

    protected override visitVariableReference(node: VariableReferenceAstNode): AstNode[] {
        return [
            this.recordReference({
                kind: "variable",
                name: node.name,
                range: node.range,
            }),
        ];
    }

    protected override visitContextItemExpression(node: ContextItemExpressionAstNode): AstNode[] {
        return [
            this.recordReference({
                kind: "variable",
                name: node.name,
                range: node.range,
            }),
        ];
    }

    protected override visitFunctionCall(node: FunctionCallAstNode): AstNode[] {
        return [this.createFunctionCallNode(node)];
    }

    protected override visitNamedFunctionReference(node: NamedFunctionReferenceAstNode): AstNode[] {
        return [this.createFunctionCallNode(node)];
    }

    protected override visitReference(node: ReferenceAstNode): AstNode[] {
        return [
            this.recordReference({
                kind: node.referenceKind,
                name: node.name,
                range: node.range,
            }),
        ];
    }

    protected override visitArgument(node: ArgumentAstNode): AstNode[] {
        return [
            this.adoptChildren<ArgumentNode>(
                {
                    kind: "argument",
                    range: node.range,
                    children: [],
                    index: node.index,
                },
                this.visitChildrenAsNodes(node),
            ),
        ];
    }

    private visitChildrenAsNodes(node: ParserAstNode): AstNode[] {
        return this.visitChildren(node).flat();
    }

    private visitBindingDeclaration(
        kind: VariableKind,
        binding: AstBinding,
        visitValue: () => AstNode[],
    ): AstNode[] {
        const definition = this.variableDefinition(kind, binding);
        const children = visitValue();
        this.declareDefinition(definition);
        return [this.createDeclarationNode(definition, children)];
    }

    private createFunctionCallNode(
        node: FunctionCallAstNode | NamedFunctionReferenceAstNode,
    ): FunctionCallNode {
        const name = this.normalizeFunctionName(node.name, node.nameRange);
        const reference = this.recordNormalizedReference("function", name, node.nameRange);
        const children = [reference, ...this.visitChildrenAsNodes(node)];
        return this.adoptChildren<FunctionCallNode>(
            {
                kind: "function-call",
                range: node.range,
                children: [],
                name,
                nameRange: node.nameRange,
                reference,
                arguments: children.filter(
                    (child): child is ArgumentNode => child.kind === "argument",
                ),
            },
            children,
        );
    }

    private createDeclarationNode(
        declaration: SourceDefinition,
        children: AstNode[] = [],
    ): DeclarationNode {
        return this.adoptChildren<DeclarationNode>(
            {
                kind: "declaration",
                range: declaration.range,
                children: [],
                declaration,
            },
            children,
        );
    }

    private adoptChildren<T extends AstNode>(parent: T, children: AstNode[]): T {
        parent.children = children;
        for (const child of children) {
            child.parent = parent;
        }
        return parent;
    }

    private enterScope<T>(range: Range, callback: () => T): T {
        const previousScope = this.currentScope;
        this.currentScope = this.currentScope.enter(
            this.document.offsetAt(range.start),
            this.document.offsetAt(range.end),
        );
        try {
            return callback();
        } finally {
            this.currentScope = previousScope;
        }
    }

    private declareDefinition(definition: SourceDefinition): void {
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

    private recordReference(reference: LexicalReference): ReferenceNode {
        const name =
            reference.kind === "function"
                ? this.normalizeFunctionName(reference.name as LexicalFunctionName, reference.range)
                : this.normalizeVarName(reference.name as LexicalVarName, reference.range);
        return this.recordNormalizedReference(
            reference.kind,
            name as ResolvedReferenceNameByKind[typeof reference.kind],
            reference.range,
        );
    }

    private recordNormalizedReference<K extends keyof ResolvedReferenceNameByKind>(
        kind: K,
        name: ResolvedReferenceNameByKind[K],
        range: Range,
    ): ReferenceNode<K> {
        const lookupName = resolvedReferenceNameToString(name, kind);
        const declaration = this.resolve(kind, name);
        const resolvedReference =
            declaration === undefined
                ? undefined
                : ({
                      kind,
                      name,
                      range,
                      declaration,
                  } as unknown as ResolvedReference<K>);

        if (declaration === undefined) {
            this.analysis.diagnostics.push({
                severity: DiagnosticSeverity.Error,
                message: `Reference to undefined ${kind} '${lookupName}'`,
                range,
                code: `unresolved-${kind}`,
            });
        } else if (isSourceDefinition(declaration) && resolvedReference !== undefined) {
            declaration.references.push(resolvedReference);
        }

        return {
            kind: "reference",
            range,
            children: [],
            referenceKind: kind,
            name,
            resolution: resolvedReference,
        };
    }

    private createFunctionParameterNodes(
        definition: SourceFunctionDefinition,
        parameters: AstParameter[],
    ): DeclarationNode[] {
        return parameters.map((parameter) => {
            const parameterDefinition = createParameterDefinition(
                this.document,
                this.normalizeVarName(parameter.name, parameter.selectionRange),
                parameter.range,
                parameter.selectionRange,
                definition,
            );
            this.declareDefinition(parameterDefinition);
            definition.parameters.push(parameterDefinition);
            return this.createDeclarationNode(parameterDefinition);
        });
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
