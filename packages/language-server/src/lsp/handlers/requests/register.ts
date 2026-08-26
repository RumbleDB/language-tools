import type { RumbleWrapperClient } from "server/integrations/rumble/client.js";
import type { TextDocument } from "vscode-languageserver-textdocument";
import type { Connection, TextDocuments } from "vscode-languageserver/node";

import { registerRunQuery } from "./run-query.js";

export function registerRequestHandlers(
    connection: Connection,
    documents: TextDocuments<TextDocument>,
    wrapper: RumbleWrapperClient,
): void {
    registerRunQuery(connection, documents, wrapper);
}
