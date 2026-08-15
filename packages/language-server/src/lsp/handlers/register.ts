import type { TextDocument } from "vscode-languageserver-textdocument";
import type { Connection, TextDocuments } from "vscode-languageserver/node";

import { formatDocument } from "../../formatter/index.js";
import { supportsDocument } from "../../parser/registry.js";
import type { WorkspaceController } from "../../workspace/controller.js";
import { findCompletionsWithTypeInfo } from "../features/completion.js";
import { findDefinitionLocation } from "../features/definition.js";
import { collectDocumentLinks } from "../features/document-links.js";
import { collectDocumentSymbols } from "../features/document-symbols.js";
import { findHover } from "../features/hover.js";
import { collectInlayHints } from "../features/inlay-hints.js";
import { findReferenceLocations } from "../features/references.js";
import { buildRenameWorkspaceEdit, prepareRename } from "../features/rename.js";
import { collectSemanticTokens } from "../features/semantic-tokens.js";
import { findSignatureHelp } from "../features/signature-help.js";

export function registerLanguageFeatureHandlers(
    connection: Connection,
    documents: TextDocuments<TextDocument>,
    workspace: WorkspaceController,
): void {
    const getSupportedDocument = (uri: string): TextDocument | undefined => {
        const document = documents.get(uri);
        return document !== undefined && supportsDocument(document) ? document : undefined;
    };

    connection.onDocumentSymbol((params) => {
        const document = getSupportedDocument(params.textDocument.uri);
        return document === undefined ? [] : collectDocumentSymbols(document);
    });

    connection.onDocumentLinks((params) => {
        const document = getSupportedDocument(params.textDocument.uri);
        return document === undefined ? [] : collectDocumentLinks(document);
    });

    connection.onDefinition((params) => {
        const document = getSupportedDocument(params.textDocument.uri);
        return document === undefined ? null : findDefinitionLocation(document, params.position);
    });

    connection.onReferences(async (params) => {
        await workspace.ready();
        const document = getSupportedDocument(params.textDocument.uri);
        return document === undefined
            ? []
            : findReferenceLocations(document, params.position, params.context.includeDeclaration);
    });

    connection.onPrepareRename((params) => {
        const document = getSupportedDocument(params.textDocument.uri);
        return document === undefined ? null : prepareRename(document, params.position);
    });

    connection.onRenameRequest(async (params) => {
        await workspace.ready();
        const document = getSupportedDocument(params.textDocument.uri);
        return document === undefined
            ? null
            : buildRenameWorkspaceEdit(document, params.position, params.newName);
    });

    connection.onHover((params) => {
        const document = getSupportedDocument(params.textDocument.uri);
        return document === undefined ? null : findHover(document, params.position);
    });

    connection.onSignatureHelp((params) => {
        const document = getSupportedDocument(params.textDocument.uri);
        return document === undefined ? null : findSignatureHelp(document, params.position);
    });

    connection.languages.inlayHint.on((params) => {
        const document = getSupportedDocument(params.textDocument.uri);
        return document === undefined ? [] : collectInlayHints(document, params.range);
    });

    connection.onCompletion((params) => {
        const document = getSupportedDocument(params.textDocument.uri);
        return document === undefined ? [] : findCompletionsWithTypeInfo(document, params.position);
    });

    connection.languages.semanticTokens.on((params) => {
        const document = getSupportedDocument(params.textDocument.uri);
        return document === undefined ? { data: [] } : collectSemanticTokens(document);
    });

    connection.onDocumentFormatting((params) => {
        const document = getSupportedDocument(params.textDocument.uri);
        return document === undefined ? [] : formatDocument(document);
    });
}
