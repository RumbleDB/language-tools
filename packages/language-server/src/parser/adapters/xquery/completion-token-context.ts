import { TokenContextAnalyzer } from "server/parser/completion-context.js";

import { XQueryLexer } from "./grammar/XQueryLexer.js";

export class XQueryTokenContextAnalyzer extends TokenContextAnalyzer {
    public override isAfterDeclareFunction(): boolean {
        return (
            this.previous?.type === XQueryLexer.KW_FUNCTION &&
            this.beforePreviousIs(XQueryLexer.KW_DECLARE)
        );
    }

    protected override get ncNameTokenType(): number {
        return XQueryLexer.NCName;
    }

    protected override get colonTokenType(): number {
        return XQueryLexer.COLON;
    }

    protected override get dollarTokenType(): number {
        return XQueryLexer.DOLLAR;
    }

    protected override get typeNameIntroducerTokenTypes(): readonly number[] {
        return [XQueryLexer.KW_AS, XQueryLexer.KW_OF];
    }

    protected override get lexerSymbolicNames(): ReadonlyArray<string | null> {
        return XQueryLexer.symbolicNames;
    }

    public override isAtTopLevelProlog(): boolean {
        if (this.tokensBeforeCursor.length === 0) {
            return true;
        }

        return this.braceDepth === 0 && this.previous?.type === XQueryLexer.SEMICOLON;
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
