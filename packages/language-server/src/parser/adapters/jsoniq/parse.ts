import { parseDocument } from "server/parser/shared/parse.js";
import type { ParseResult } from "server/parser/types/result.js";
import type { TextDocument } from "vscode-languageserver-textdocument";

import { buildJsoniqAst } from "./ast.js";
import { JsoniqLexer } from "./grammar/JsoniqLexer.js";
import { JsoniqParser } from "./grammar/JsoniqParser.js";

export function parseJsoniq(document: TextDocument): ParseResult {
    return parseDocument(document, {
        lexer: JsoniqLexer,
        parser: JsoniqParser,
        buildAst: buildJsoniqAst,
    });
}
