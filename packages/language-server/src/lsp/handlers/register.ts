import type { TextDocument } from "vscode-languageserver-textdocument";
import type { Connection, TextDocuments } from "vscode-languageserver/node";

import type { ParserService } from "../../parser/index.js";
import type { WorkspaceService } from "../../workspace/service.js";
import { registerCompletion } from "../features/completion.js";
import { createFeatureRegistrationContext } from "../features/context.js";
import { registerDefinition } from "../features/definition.js";
import { registerDocumentLinks } from "../features/document-links.js";
import { registerDocumentSymbols } from "../features/document-symbols.js";
import { registerFormatting } from "../features/formatting.js";
import { registerHover } from "../features/hover.js";
import { registerInlayHints } from "../features/inlay-hints.js";
import { registerReferences } from "../features/references.js";
import { registerRename } from "../features/rename.js";
import { registerSemanticTokens } from "../features/semantic-tokens.js";
import { registerSignatureHelp } from "../features/signature-help.js";

export function registerLanguageFeatureHandlers(dependencies: LanguageFeatureDependencies): void {
    const { connection, documents, parser, workspace } = dependencies;
    const context = createFeatureRegistrationContext(connection, documents, parser, workspace);

    registerCompletion(context);
    registerDefinition(context);
    registerDocumentLinks(context);
    registerDocumentSymbols(context);
    registerFormatting(context);
    registerHover(context);
    registerInlayHints(context);
    registerReferences(context);
    registerRename(context);
    registerSemanticTokens(context);
    registerSignatureHelp(context);
}

export interface LanguageFeatureDependencies {
    readonly connection: Connection;
    readonly documents: TextDocuments<TextDocument>;
    readonly parser: ParserService;
    readonly workspace: WorkspaceService;
}
