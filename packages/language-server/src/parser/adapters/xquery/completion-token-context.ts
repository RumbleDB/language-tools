import { Token } from "antlr4ng";
import { TokenContextAnalyzer } from "server/parser/completion-context.js";

import { XQueryLexer } from "./grammar/XQueryLexer.js";

const VARIABLE_DECLARATION_STARTERS = new Set([
    XQueryLexer.KW_VARIABLE,
    XQueryLexer.KW_LET,
    XQueryLexer.KW_FOR,
    XQueryLexer.KW_EVERY,
    XQueryLexer.KW_SOME,
    XQueryLexer.KW_COUNT,
]);

export class XQueryTokenContextAnalyzer extends TokenContextAnalyzer {
    public override isAfterDeclareFunction(): boolean {
        return (
            this.previous?.type === XQueryLexer.KW_FUNCTION &&
            this.beforePreviousIs(XQueryLexer.KW_DECLARE)
        );
    }

    public override isAtTypeName(): boolean {
        return this.previous?.type === XQueryLexer.KW_AS;
    }

    public override isAtVariableDeclarationName(): boolean {
        if (this.previous === undefined) {
            return false;
        }

        if (this.isVariableDeclarationStarter(this.previous)) {
            return true;
        }

        return (
            this.previous.type === XQueryLexer.DOLLAR &&
            this.beforePrevious !== undefined &&
            (this.isVariableDeclarationStarter(this.beforePrevious) ||
                this.isAfterFunctionParameterSeparator())
        );
    }

    public override isAtTopLevelProlog(): boolean {
        if (this.tokensBeforeCursor.length === 0) {
            return true;
        }

        return this.braceDepth === 0 && this.previous?.type === XQueryLexer.SEMICOLON;
    }

    private isAfterFunctionParameterSeparator(): boolean {
        if (
            this.beforePrevious?.type !== XQueryLexer.LPAREN &&
            this.beforePrevious?.type !== XQueryLexer.COMMA
        ) {
            return false;
        }

        return (
            this.lastIndexOf(XQueryLexer.KW_FUNCTION) >
            Math.max(this.lastIndexOf(XQueryLexer.LBRACE), this.lastIndexOf(XQueryLexer.RPAREN))
        );
    }

    private isVariableDeclarationStarter(token: Token): boolean {
        return VARIABLE_DECLARATION_STARTERS.has(token.type);
    }

    private get braceDepth(): number {
        let depth = 0;
        for (const token of this.tokensBeforeCursor) {
            if (token.type === XQueryLexer.LBRACE) {
                depth += 1;
            } else if (token.type === XQueryLexer.RBRACE) {
                depth = Math.max(depth - 1, 0);
            }
        }

        return depth;
    }
}
