import { createParserAdapter } from "../common/adapter.js";
import { XQueryLexer } from "./grammar/XQueryLexer.js";
import { XQueryParser } from "./grammar/XQueryParser.js";

export const xqueryParserAdapter = createParserAdapter({
    id: "xquery",
    lexer: XQueryLexer,
    parser: XQueryParser,
});
