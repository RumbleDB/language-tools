import { Token } from "antlr4ng";
import { TokenContextAnalyzer } from "server/parser/completion-context.js";

import { JsoniqLexer } from "./grammar/JsoniqLexer.js";

const VARIABLE_DECLARATION_STARTERS = new Set([
    JsoniqLexer.KW_VARIABLE,
    JsoniqLexer.KW_LET,
    JsoniqLexer.KW_FOR,
    JsoniqLexer.KW_EVERY,
    JsoniqLexer.KW_SOME,
    JsoniqLexer.KW_COUNT,
]);

export class JsoniqTokenContextAnalyzer extends TokenContextAnalyzer {
    public override isAfterDeclareFunction(): boolean {
        return (
            this.previous?.type === JsoniqLexer.KW_FUNCTION &&
            this.beforePreviousIs(JsoniqLexer.KW_DECLARE)
        );
    }

    public override isAtTypeName(): boolean {
        return this.previous?.type === JsoniqLexer.KW_AS;
    }

    public override isAtVariableDeclarationName(): boolean {
        if (this.previous === undefined) {
            return false;
        }

        if (this.isVariableDeclarationStarter(this.previous)) {
            return true;
        }

        return (
            this.previous.type === JsoniqLexer.DOLLAR &&
            this.beforePrevious !== undefined &&
            (this.isVariableDeclarationStarter(this.beforePrevious) ||
                this.isAfterFunctionParameterSeparator())
        );
    }

    public override isAtTopLevelProlog(): boolean {
        if (this.tokensBeforeCursor.length === 0) {
            return true;
        }

        return this.braceDepth === 0 && this.previous?.type === JsoniqLexer.SEMICOLON;
    }

    private isAfterFunctionParameterSeparator(): boolean {
        if (
            this.beforePrevious?.type !== JsoniqLexer.LPAREN &&
            this.beforePrevious?.type !== JsoniqLexer.COMMA
        ) {
            return false;
        }

        return (
            this.lastIndexOf(JsoniqLexer.KW_FUNCTION) >
            Math.max(this.lastIndexOf(JsoniqLexer.LBRACE), this.lastIndexOf(JsoniqLexer.RPAREN))
        );
    }

    private isVariableDeclarationStarter(token: Token): boolean {
        return VARIABLE_DECLARATION_STARTERS.has(token.type);
    }

    private get braceDepth(): number {
        let depth = 0;
        for (const token of this.tokensBeforeCursor) {
            if (token.type === JsoniqLexer.LBRACE) {
                depth += 1;
            } else if (token.type === JsoniqLexer.RBRACE) {
                depth = Math.max(depth - 1, 0);
            }
        }

        return depth;
    }
}
