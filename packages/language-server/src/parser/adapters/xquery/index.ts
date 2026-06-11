import type { ParserAdapter } from "server/parser/types/adapter.js";
import { hasJsoniqCellMagic } from "server/parser/utils.js";
import { TextDocument } from "vscode-languageserver-textdocument";

import { getCompletionIntent } from "./completion-context.js";
import { parseXQuery, type XQueryParsedDocument } from "./parse.js";

export type { XQueryParsedDocument as JsoniqParsedDocument } from "./parse.js";

const JSONIQ_LANGUAGE_ID = "jsoniq";

export const xqueryParserAdapter: ParserAdapter = {
    id: "xquery",
    supports: (document: TextDocument) =>
        document.languageId === JSONIQ_LANGUAGE_ID || hasJsoniqCellMagic(document),
    parse: parseXQuery,
    getCompletionIntent: (parsed, cursorOffset) =>
        getCompletionIntent(parsed as XQueryParsedDocument, cursorOffset),
};
