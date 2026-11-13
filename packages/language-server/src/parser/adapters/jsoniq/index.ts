import { createParserAdapter } from "../common/adapter.js";
import { JsoniqLexer } from "./grammar/JsoniqLexer.js";
import { JsoniqParser } from "./grammar/JsoniqParser.js";

export const jsoniqParserAdapter = createParserAdapter({
    id: "jsoniq",
    lexer: JsoniqLexer,
    parser: JsoniqParser,
    ignoredTokens: [JsoniqLexer.LBRACE_VBAR, JsoniqLexer.RBRACE_VBAR],
    expressionKeywords: [
        JsoniqLexer.KW_TRUE,
        JsoniqLexer.KW_FALSE,
        JsoniqLexer.KW_NULL,
        JsoniqLexer.KW_NOT,
        JsoniqLexer.KW_JSONIQ,
    ],
    keywords: [[JsoniqLexer.KW_JSONIQ, "jsoniq version"]],
    declarationRules: [JsoniqParser.RULE_typeDecl],
    objectLookupRule: JsoniqParser.RULE_objectLookupKey,
});
