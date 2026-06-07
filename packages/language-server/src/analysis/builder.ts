import { parseDocument } from "server/parser/index.js";
import type {
    AstBinding,
    AstNode,
    AstParameter,
    CatchClauseAstNode,
    FunctionDeclarationAstNode,
} from "server/parser/types/ast.js";
import { referenceNameToString } from "server/parser/types/name.js";
import { comparePositions } from "server/utils/position.js";
import { BuiltinFunctions } from "server/wrapper/builtin-functions.js";
import { DiagnosticSeverity, Position } from "vscode-languageserver";
import { TextDocument } from "vscode-languageserver-textdocument";

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
import { Scope } from "./scope.js";

const CATCH_VARIABLES = [
    { qname: { prefix: "err", localName: "code" } },
    { qname: { prefix: "err", localName: "description" } },
    { qname: { prefix: "err", localName: "value" } },
    { qname: { prefix: "err", localName: "module" } },
    { qname: { prefix: "err", localName: "line-number" } },
    { qname: { prefix: "err", localName: "column-number" } },
    { qname: { prefix: "err", localName: "additional" } },
] as const;

class AnalysisBuilder {
    private static readonly NEVER_VISIBLE_OFFSET = Number.POSITIVE_INFINITY;

    private readonly analysis: JsoniqAnalysis;

    private currentScope: Scope;

    public constructor(
        private readonly document: TextDocument,
        private readonly builtinFunctions: BuiltinFunctions,
    ) {
        const namespaces = new Map<string, SourceNamespaceDefinition>();
        this.analysis = {
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
        this.visitNode(parseDocument(this.document).ast);

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

    private visitNode(node: AstNode): void {
        switch (node.kind) {
            case "module":
                this.visitChildren(node);
                break;
            case "namespace-declaration":
                const definition = createNamespaceDefinition(
                    this.document,
                    node.prefix,
                    node.namespaceUri,
                    node.range,
                    node.selectionRange,
                );
                this.recordDefinition(definition);
                this.analysis.namespaces.set(definition.name.prefix, definition);
                break;
            case "context-item-declaration":
                this.recordDefinition(
                    createVariableDefinition(
                        this.document,
                        "declare-variable",
                        node.name,
                        node.range,
                        node.selectionRange,
                    ),
                );
                break;
            case "type-declaration":
                this.recordDefinition(
                    createTypeDefinition(this.document, node.name, node.range, node.selectionRange),
                );
                break;
            case "function-declaration":
                this.visitFunctionDeclaration(node);
                break;
            case "variable-declaration": {
                const variableDefinition = createVariableDefinition(
                    this.document,
                    "declare-variable",
                    node.binding.name,
                    node.binding.range,
                    node.binding.selectionRange,
                    node.completed
                        ? this.document.offsetAt(node.range.end)
                        : AnalysisBuilder.NEVER_VISIBLE_OFFSET,
                );
                this.visitChildren(node);
                this.recordDefinition(variableDefinition);
                break;
            }
            case "let-binding":
                this.visitChildren(node);
                this.recordDefinition(this.variableDefinition("let", node.binding));
                break;
            case "group-by-binding":
                this.visitChildren(node);
                this.recordDefinition(this.variableDefinition("group-by", node.binding));
                break;
            case "count-clause":
                this.visitChildren(node);
                this.recordDefinition(this.variableDefinition("count", node.binding));
                break;
            case "for-binding":
                this.visitChildren(node);
                for (const binding of node.bindings) {
                    this.recordDefinition(this.variableDefinition(binding.bindingKind, binding));
                }
                break;
            case "flowr-expression":
                this.visitScopedChildren(node);
                break;
            case "catch-clause":
                this.visitCatchClause(node);
                break;
            case "variable-reference":
            case "context-item-expression":
                this.recordReference({
                    kind: "variable",
                    name: node.name,
                    range: node.range,
                });
                break;
            case "function-call":
            case "named-function-reference":
                this.recordReference({
                    kind: "function",
                    name: node.name,
                    range: node.nameRange,
                });
                this.visitChildren(node);
                break;
            case "reference":
                this.recordReference({
                    kind: node.referenceKind,
                    name: node.name,
                    range: node.range,
                });
                break;
            case "argument":
                this.visitChildren(node);
                break;
            case "unknown":
                this.visitChildren(node);
                break;
            default:
                throw node satisfies never;
        }
    }

    private visitChildren(node: AstNode) {
        for (const child of node.children) {
            this.visitNode(child);
        }
    }

    private visitFunctionDeclaration(node: FunctionDeclarationAstNode) {
        const definition = createFunctionDefinition(
            this.document,
            node.name,
            node.range,
            node.nameRange,
        );
        this.recordDefinition(definition);
        this.pushScope(node.range.start, node.range.end);
        this.registerFunctionParameters(definition, node.parameters);
        this.visitChildren(node);
        this.popScope();
    }

    private visitCatchClause(node: CatchClauseAstNode) {
        this.pushScope(node.range.start, node.range.end);
        for (const name of CATCH_VARIABLES) {
            this.recordDefinition(
                createVariableDefinition(
                    this.document,
                    "catch-variable",
                    name,
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

    private visitScopedChildren(node: AstNode) {
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

    private resolve(reference: AnyReference): Definition | undefined {
        const lookupName = referenceNameToString(reference.name, reference.kind);
        const builtinDefinition = this.builtinFunctions.find(lookupName);
        if (builtinDefinition !== undefined) {
            return builtinDefinition;
        }

        return this.currentScope.resolve(reference.kind, reference.name);
    }

    private recordReference(reference: AnyReference) {
        const lookupName = referenceNameToString(reference.name, reference.kind);
        const declaration = this.resolve(reference);
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
                parameter.name,
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
            binding.name,
            binding.range,
            binding.selectionRange,
            this.document.offsetAt(binding.range.end),
        );
    }
}

export function buildAnalysis(
    document: TextDocument,
    builtinFunctions: BuiltinFunctions = { all: [], find: () => undefined },
): JsoniqAnalysis {
    return new AnalysisBuilder(document, builtinFunctions).build();
}
