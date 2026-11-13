import { parseDocument } from "server/parser/shared/parse.js";
import type { ParseResult } from "server/parser/types/result.js";
import type { TextDocument } from "vscode-languageserver-textdocument";

import { XQueryLexer } from "./grammar/XQueryLexer.js";
import { XQueryParser } from "./grammar/XQueryParser.js";

export function parseXQuery(document: TextDocument): ParseResult {
    return parseDocument(document, {
        lexer: XQueryLexer,
        parser: XQueryParser,
    });
}
