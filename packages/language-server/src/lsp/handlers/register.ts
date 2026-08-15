import type { TextDocument } from "vscode-languageserver-textdocument";
import type { Connection, TextDocuments } from "vscode-languageserver/node";

import { findCompletionsWithTypeInfo } from "../../completion.js";
import { findDefinitionLocation } from "../../definitions.js";
import { collectDocumentLinks } from "../../document-links.js";
import { formatDocument } from "../../formatter/index.js";
import { findHover } from "../../hover.js";
import { collectInlayHints } from "../../inlay-hints.js";
import { supportsDocument } from "../../parser/registry.js";
import { findReferenceLocations } from "../../references.js";
import { buildRenameWorkspaceEdit, prepareRename } from "../../rename.js";
import { collectSemanticTokens } from "../../semantic.js";
import { findSignatureHelp } from "../../signature-help.js";
import { collectDocumentSymbols } from "../../symbols.js";
import type { WorkspaceController } from "../../workspace/controller.js";

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
