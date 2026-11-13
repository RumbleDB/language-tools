import type { ParseTree, ParserRuleContext } from "antlr4ng";
import * as ctx from "server/parser/context.js";
import { parseFunctionName, parseVarName } from "server/parser/shared/name.js";
import { parseQNameText, type Prefix } from "server/parser/types/name.js";
import { rangeFromNode } from "server/utils/range.js";
import {
    DiagnosticSeverity,
    type Diagnostic,
    type DocumentUri,
    type Range,
} from "vscode-languageserver";
import type { TextDocument } from "vscode-languageserver-textdocument";

import { definitionNameToString, duplicateSymbolErrorCode } from "../model/definitions.js";
import type {
    SourceFunctionDefinition,
    SourceModuleExportDefinition,
    SourceNamespaceDefinition,
    SourceTypeDefinition,
    SourceVariableDefinition,
} from "../model/definitions.js";
import type { ModuleImport, SchemaImport } from "../model/module-info.js";
import { SourceDefinitionFactory } from "./definition-factory.js";
import { NamespaceResolver } from "./name-resolution.js";

export interface ModulePrologDeclarations {
    /** Library module declarations, module and schema imports, and namespace declarations. */
    readonly namespaces: ReadonlyMap<ParserRuleContext, SourceNamespaceDefinition>;
    readonly functions: ReadonlyMap<ctx.FunctionDeclContext, SourceFunctionDefinition>;
    readonly variables: ReadonlyMap<ctx.VarDeclContext, SourceVariableDefinition>;
    readonly types: ReadonlyMap<ctx.TypeDeclContext, SourceTypeDefinition>;
}

export interface ModuleProlog {
    readonly uri: DocumentUri;
    readonly targetNamespace: string | undefined;
    readonly imports: readonly ModuleImport[];
    readonly baseUri: string | undefined;
    /** Explicit default for unprefixed element/type names; an empty string means no namespace. */
    readonly defaultElementTypeNamespace: string | undefined;
    /** Explicit default for unprefixed function names; an empty string means no namespace. */
    readonly defaultFunctionNamespace: string | undefined;
    readonly schemaImports: readonly SchemaImport[];
    readonly namespaces: ReadonlyMap<Prefix, SourceNamespaceDefinition>;
    readonly declarations: ModulePrologDeclarations;
    readonly exports: ReadonlyMap<string, SourceModuleExportDefinition>;
    readonly diagnostics: readonly Diagnostic[];
    readonly definitions: SourceDefinitionFactory;
}

function unquoteStringLiteral(text: string): string {
    return text.length >= 2 &&
        ((text.startsWith('"') && text.endsWith('"')) ||
            (text.startsWith("'") && text.endsWith("'")))
        ? text.slice(1, -1)
        : text;
}

function hasPrivateAnnotation(node: ctx.FunctionDeclContext | ctx.VarDeclContext): boolean {
    return (
        node
            .annotations()
            ?.annotation()
            .some((annotation) => {
                const name = annotation._name?.getText() ?? "";
                return name === "private" || name.endsWith(":private") || name.endsWith("}private");
            }) ?? false
    );
}

/**
 * Collects the declarations of a module's prolog from its parse tree. The parsers of both languages dispatch a node to
 * the visit method of its rule by name, so one visitor serves both. Only the prolog is walked: the query body and the
 * bodies of declarations declare nothing at module level.
 */
class ModulePrologCollector extends ctx.ParserVisitor<void> {
    private readonly imports: ModuleImport[] = [];
    private readonly schemaImports: SchemaImport[] = [];
    private readonly exports = new Map<string, SourceModuleExportDefinition>();
    private readonly namespaces = new Map<Prefix, SourceNamespaceDefinition>();
    private readonly declarations = {
        namespaces: new Map<ParserRuleContext, SourceNamespaceDefinition>(),
        functions: new Map<ctx.FunctionDeclContext, SourceFunctionDefinition>(),
        variables: new Map<ctx.VarDeclContext, SourceVariableDefinition>(),
        types: new Map<ctx.TypeDeclContext, SourceTypeDefinition>(),
    };
    private readonly prologDeclarationNames = new Map<
        string,
        SourceFunctionDefinition | SourceVariableDefinition | SourceTypeDefinition
    >();
    private readonly diagnostics: Diagnostic[] = [];
    private readonly definitions: SourceDefinitionFactory;
    private readonly nameResolver: NamespaceResolver;
    private baseUri: string | undefined;
    private defaultElementTypeNamespace: string | undefined;
    private defaultFunctionNamespace: string | undefined;
    private targetNamespace: string | undefined;

    public constructor(private readonly document: TextDocument) {
        super();
        this.definitions = new SourceDefinitionFactory(document.uri);
        this.nameResolver = new NamespaceResolver(this.namespaces, (diagnostic) =>
            this.diagnostics.push(diagnostic),
        );
    }

    public collect(tree: ctx.ModuleAndThisIsItContext): ModuleProlog {
        this.visit(tree);

        return {
            uri: this.document.uri,
            targetNamespace: this.targetNamespace,
            imports: this.imports,
            schemaImports: this.schemaImports,
            baseUri: this.baseUri,
            defaultElementTypeNamespace: this.defaultElementTypeNamespace,
            defaultFunctionNamespace: this.defaultFunctionNamespace,
            namespaces: this.namespaces,
            declarations: this.declarations,
            exports: this.exports,
            diagnostics: this.diagnostics,
            definitions: this.definitions,
        };
    }

    public override visitProgram = (): void => {};

    public override visitLibraryModule = (node: ctx.LibraryModuleContext): void => {
        const prefixNode = node.ncName();
        const prefix = prefixNode.getText().trim();
        const namespaceUri = unquoteStringLiteral(node.uriLiteral().getText());
        // The declaration ends at its semicolon; the prolog after it is not part of it.
        const range = {
            start: this.range(node.KW_MODULE()).start,
            end: this.range(node.SEMICOLON()).end,
        };
        const selectionRange = this.range(prefixNode);

        if (namespaceUri.length === 0) {
            this.diagnostics.push({
                severity: DiagnosticSeverity.Error,
                code: "XQST0088",
                message: "A library module target namespace cannot be empty.",
                range,
            });
        }
        if (prefix === "xml" || prefix === "xmlns") {
            this.diagnostics.push({
                severity: DiagnosticSeverity.Error,
                code: "XQST0070",
                message: `Prefix '${prefix}' cannot be used for a library module.`,
                range: selectionRange,
            });
        }
        this.targetNamespace = namespaceUri;
        this.bindNamespace(node, prefix, namespaceUri, range, selectionRange);
        this.visitChildren(node);
    };

    public override visitModuleImport = (node: ctx.ModuleImportContext): void => {
        const target = node._targetNamespace;
        if (target === undefined) return;

        const moduleImport: ModuleImport = {
            ...this.importPrefix(node._prefix),
            namespaceUri: unquoteStringLiteral(target.getText()),
            namespaceUriRange: this.range(target),
            locations: this.locations(node._locations),
            range: this.range(node),
        };
        this.imports.push(moduleImport);
        this.bindImportedNamespace(node, moduleImport);
    };

    public override visitBaseURIDecl = (node: ctx.BaseURIDeclContext): void => {
        this.baseUri ??= unquoteStringLiteral(node.uriLiteral().getText());
    };

    public override visitNamespaceDecl = (node: ctx.NamespaceDeclContext): void => {
        const prefixNode = node.ncName();
        const namespaceUri = node.uriLiteral();
        const prefix = prefixNode?.getText().trim() ?? "";
        if (prefixNode === null || prefix === "" || namespaceUri === null) return;

        this.bindNamespace(
            node,
            prefix,
            unquoteStringLiteral(namespaceUri.getText()),
            this.range(node),
            this.range(prefixNode),
        );
    };

    public override visitSchemaImport = (node: ctx.SchemaImportContext): void => {
        const namespaceUri = node._nsURI;
        if (namespaceUri === undefined) return;

        const schemaPrefix = node.schemaPrefix();
        const schemaImport: SchemaImport = {
            ...this.importPrefix(schemaPrefix?.ncName()),
            defaultElementNamespace: schemaPrefix?.KW_DEFAULT() != null,
            namespaceUri: unquoteStringLiteral(namespaceUri.getText()),
            namespaceUriRange: this.range(namespaceUri),
            locations: this.locations(node._locations),
            range: this.range(node),
        };
        this.schemaImports.push(schemaImport);
        if (schemaImport.defaultElementNamespace) {
            this.setDefaultElementTypeNamespace(
                schemaImport.namespaceUri,
                schemaImport.namespaceUriRange,
            );
        }
        this.bindImportedNamespace(node, schemaImport);
    };

    public override visitDefaultNamespaceDecl = (node: ctx.DefaultNamespaceDeclContext): void => {
        const namespaceUriNode = node.stringLiteral();
        if (namespaceUriNode === null) return;

        const namespaceUri = unquoteStringLiteral(namespaceUriNode.getText());
        const namespaceUriRange = this.range(namespaceUriNode);
        if (node.KW_ELEMENT() !== null) {
            this.setDefaultElementTypeNamespace(namespaceUri, namespaceUriRange);
        } else if (this.defaultFunctionNamespace !== undefined) {
            this.diagnostics.push({
                severity: DiagnosticSeverity.Error,
                code: "XQST0066",
                message: "The default function namespace is declared more than once.",
                range: namespaceUriRange,
            });
        } else {
            this.defaultFunctionNamespace = namespaceUri;
        }
    };

    public override visitFunctionDecl = (node: ctx.FunctionDeclContext): void => {
        const parameters = node.paramList()?.param() ?? [];
        const selectionRange = this.range(node.functionName());
        const definition = this.definitions.function(
            this.nameResolver.resolveFunctionName(
                parseFunctionName(node, parameters.length),
                selectionRange,
                this.defaultFunctionNamespace,
            ),
            this.range(node),
            selectionRange,
        );
        for (const [index, parameter] of parameters.entries()) {
            const nameNode = parameter._name;
            const name = nameNode === undefined ? null : parseVarName(nameNode);
            if (nameNode === undefined || name === null) continue;

            const nameRange = this.range(nameNode);
            this.definitions.addParameter(
                definition,
                index,
                this.nameResolver.resolveQName(name, nameRange),
                this.range(parameter),
                nameRange,
            );
        }
        this.declarations.functions.set(node, definition);
        this.checkDeclaration(definition, hasPrivateAnnotation(node));
    };

    public override visitVarDecl = (node: ctx.VarDeclContext): void => {
        const binding = node.varBinding();
        const terminator = node.SEMICOLON();
        const name = binding === null ? null : parseVarName(binding);
        // Without its semicolon, the declaration is incomplete and declares nothing.
        if (name === null || terminator === null || terminator.symbol.tokenIndex < 0) return;

        const selectionRange = this.range(binding);
        const definition = this.definitions.variable(
            this.nameResolver.resolveQName(name, selectionRange),
            this.range(node),
            selectionRange,
        );
        this.declarations.variables.set(node, definition);
        this.checkDeclaration(definition, hasPrivateAnnotation(node));
    };

    /** A JSONiq type declaration. */
    public override visitTypeDecl = (node: ctx.TypeDeclContext): void => {
        const nameNode = node.qname();
        const selectionRange = this.range(nameNode);
        const definition = this.definitions.type(
            this.nameResolver.resolveQName(parseQNameText(nameNode.getText()), selectionRange),
            this.range(node),
            selectionRange,
        );
        this.declarations.types.set(node, definition);
        this.checkDeclaration(definition, false);
    };

    private range(node: ParseTree): Range {
        return rangeFromNode(node, this.document);
    }

    private importPrefix(
        node: ParserRuleContext | null | undefined,
    ): Pick<ModuleImport, "prefix" | "prefixRange"> {
        return node == null ? {} : { prefix: node.getText().trim(), prefixRange: this.range(node) };
    }

    private locations(nodes: readonly ParseTree[]): ModuleImport["locations"] {
        return nodes.map((location) => ({
            uri: unquoteStringLiteral(location.getText()),
            range: this.range(location),
        }));
    }

    private setDefaultElementTypeNamespace(namespaceUri: string, range: Range): void {
        if (this.defaultElementTypeNamespace !== undefined) {
            this.diagnostics.push({
                severity: DiagnosticSeverity.Error,
                code: "XQST0066",
                message: "The default element/type namespace is declared more than once.",
                range,
            });
            return;
        }
        this.defaultElementTypeNamespace = namespaceUri;
    }

    private bindImportedNamespace(node: ParserRuleContext, imported: ModuleImport): void {
        if (imported.prefix === undefined || imported.prefixRange === undefined) return;
        this.bindNamespace(
            node,
            imported.prefix,
            imported.namespaceUri,
            imported.range,
            imported.prefixRange,
        );
    }

    private bindNamespace(
        node: ParserRuleContext,
        prefix: Prefix,
        namespaceUri: string,
        range: Range,
        selectionRange: Range,
    ): void {
        const definition = this.definitions.namespace(prefix, namespaceUri, range, selectionRange);
        this.declarations.namespaces.set(node, definition);
        this.namespaces.set(prefix, definition);
    }

    private checkDeclaration(
        definition: SourceFunctionDefinition | SourceVariableDefinition | SourceTypeDefinition,
        isPrivate: boolean,
    ): void {
        const name = definitionNameToString(definition, true);
        if (this.prologDeclarationNames.has(name)) {
            this.diagnostics.push({
                severity: DiagnosticSeverity.Error,
                code: duplicateSymbolErrorCode(definition.kind),
                message: `Prolog ${definition.kind} '${name}' is defined more than once.`,
                range: definition.selectionRange,
            });
        } else {
            this.prologDeclarationNames.set(name, definition);
        }

        if (this.targetNamespace === undefined) return;

        const namespaceUri =
            definition.kind === "function"
                ? definition.name.qname.namespaceUri
                : definition.name.namespaceUri;
        if (namespaceUri !== this.targetNamespace) {
            this.diagnostics.push({
                severity: DiagnosticSeverity.Error,
                code: "XQST0048",
                message: `A library module declaration must use namespace '${this.targetNamespace}'.`,
                range: definition.selectionRange,
            });
            return;
        }

        if (!isPrivate) {
            if (!this.exports.has(name)) {
                this.exports.set(name, definition);
            }
        }
    }
}

export function collectModuleProlog(
    document: TextDocument,
    tree: ctx.ModuleAndThisIsItContext,
): ModuleProlog {
    return new ModulePrologCollector(document).collect(tree);
}
