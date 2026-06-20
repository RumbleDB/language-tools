import { builtinFunctions } from "server/assets/builtin-functions.js";
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
    TypeDeclarationAstNode,
    VariableDeclarationAstNode,
    VariableReferenceAstNode,
} from "server/parser/types/ast.js";
import {
    isPrefixedQName,
    isUriQualifiedQName,
    Prefix,
    type LexicalFunctionName,
    type LexicalQName,
} from "server/parser/types/name.js";
import { ParserAstVisitor } from "server/parser/types/visitor.js";
import { Diagnostic, DiagnosticSeverity, Position, Range } from "vscode-languageserver";
import { TextDocument } from "vscode-languageserver-textdocument";

import type {
    ArgumentNode,
    AstNode,
    DeclarationNode,
    FunctionCallNode,
    ModuleNode,
    ReferenceNode,
} from "./ast.js";
import { defaultNamespaces } from "./default-namespaces.js";
import {
    createFunctionDefinition,
    createNamespaceDefinition,
    createParameterDefinition,
    createTypeDefinition,
    createVariableDefinition,
    Definition,
    isSourceDefinition,
    SourceDefinition,
    SourceFunctionDefinition,
    SourceNamespaceDefinition,
    VariableKind,
} from "./definitions.js";
import {
    referenceNameToString,
    type FunctionName,
    type QName,
    type ReferenceNameByKind,
} from "./names.js";
import { ResolvedReference } from "./reference.js";
import { Scope } from "./scope.js";

const CATCH_VARIABLES = [
    { kind: "prefixed-qname", prefix: "err", localName: "code" },
    { kind: "prefixed-qname", prefix: "err", localName: "description" },
    { kind: "prefixed-qname", prefix: "err", localName: "value" },
    { kind: "prefixed-qname", prefix: "err", localName: "module" },
    { kind: "prefixed-qname", prefix: "err", localName: "line-number" },
    { kind: "prefixed-qname", prefix: "err", localName: "column-number" },
    { kind: "prefixed-qname", prefix: "err", localName: "additional" },
] as const;

export interface JsoniqAnalysis {
    ast: ModuleNode;
    scope: Scope;
    namespaces: Map<Prefix, SourceNamespaceDefinition>;
    diagnostics: Diagnostic[];
}

class AnalysisBuilder extends ParserAstVisitor<AstNode[]> {
    private static readonly NEVER_VISIBLE_OFFSET = Number.POSITIVE_INFINITY;

    private readonly analysis: JsoniqAnalysis;

    private currentScope: Scope;

    private readonly document: TextDocument;

    private readonly parserAst: ParserAstNode;

    public constructor(document: TextDocument) {
        super();
        this.document = document;

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
            this.resolveQName(node.name, node.selectionRange),
            node.range,
            node.selectionRange,
        );
        this.declareDefinition(definition);
        return [this.createDeclarationNode(definition)];
    }

    protected override visitTypeDeclaration(node: TypeDeclarationAstNode): AstNode[] {
        const definition = createTypeDefinition(
            this.document,
            this.resolveQName(node.name.qname, node.selectionRange),
            node.range,
            node.selectionRange,
        );
        this.declareDefinition(definition);
        return [this.createDeclarationNode(definition)];
    }

    protected override visitFunctionDeclaration(node: FunctionDeclarationAstNode): AstNode[] {
        const definition = createFunctionDefinition(
            this.document,
            this.resolveFunctionName(node.name, node.selectionRange),
            node.range,
            node.selectionRange,
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
            this.resolveQName(node.binding.name, node.binding.selectionRange),
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
                    this.resolveQName(name, node.range),
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
            this.createReference("variable", this.resolveQName(node.name, node.range), node.range),
        ];
    }

    protected override visitContextItemExpression(node: ContextItemExpressionAstNode): AstNode[] {
        return [
            this.createReference("variable", this.resolveQName(node.name, node.range), node.range),
        ];
    }

    protected override visitFunctionCall(node: FunctionCallAstNode): AstNode[] {
        return [this.createFunctionCallNode(node)];
    }

    protected override visitNamedFunctionReference(node: NamedFunctionReferenceAstNode): AstNode[] {
        return [this.createFunctionCallNode(node)];
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
        const name = this.resolveFunctionName(node.name, node.selectionRange);
        const reference = this.createReference("function", name, node.selectionRange);
        const children = [reference, ...this.visitChildrenAsNodes(node)];
        return this.adoptChildren<FunctionCallNode>(
            {
                kind: "function-call",
                range: node.range,
                children: [],
                name,
                selectionRange: node.selectionRange,
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

    private resolve<K extends keyof ReferenceNameByKind>(
        kind: K,
        name: ReferenceNameByKind[K],
    ): Definition | undefined {
        if (kind === "function") {
            const builtinDefinition = builtinFunctions.find(name as FunctionName);
            if (builtinDefinition !== undefined) {
                return builtinDefinition;
            }
        }

        return this.currentScope.resolve(kind, name);
    }

    private createReference<K extends keyof ReferenceNameByKind>(
        kind: K,
        name: ReferenceNameByKind[K],
        range: Range,
    ): ReferenceNode<K> {
        const lookupName = referenceNameToString(name, kind, true);
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
                this.resolveQName(parameter.name, parameter.selectionRange),
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
            this.resolveQName(binding.name, binding.selectionRange),
            binding.range,
            binding.selectionRange,
            this.document.offsetAt(binding.range.end),
        );
    }

    private resolveFunctionName(name: LexicalFunctionName, range: Range): FunctionName {
        return {
            ...name,
            qname: this.resolveQName(name.qname, range),
        };
    }

    private resolveQName(qname: LexicalQName, range: Range): QName {
        const namespaceUri = isUriQualifiedQName(qname)
            ? qname.namespaceUri
            : isPrefixedQName(qname)
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

export function buildAnalysis(document: TextDocument): JsoniqAnalysis {
    return new AnalysisBuilder(document).build();
}
