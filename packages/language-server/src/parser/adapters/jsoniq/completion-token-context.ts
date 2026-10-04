import { TokenContextAnalyzer } from "server/parser/completion-context.js";

import { JsoniqLexer } from "./grammar/JsoniqLexer.js";

export class JsoniqTokenContextAnalyzer extends TokenContextAnalyzer {
    public override isAfterDeclareFunction(): boolean {
        return (
            this.previous?.type === JsoniqLexer.KW_FUNCTION &&
            this.beforePreviousIs(JsoniqLexer.KW_DECLARE)
        );
    }

    protected override get ncNameTokenType(): number {
        return JsoniqLexer.NCName;
    }

    protected override get colonTokenType(): number {
        return JsoniqLexer.COLON;
    }

    protected override get dollarTokenType(): number {
        return JsoniqLexer.DOLLAR;
    }

    protected override get typeNameIntroducerTokenTypes(): readonly number[] {
        return [JsoniqLexer.KW_AS, JsoniqLexer.KW_OF];
    }

    protected override get lexerSymbolicNames(): ReadonlyArray<string | null> {
        return JsoniqLexer.symbolicNames;
    }

    public override isAtTopLevelProlog(): boolean {
        if (this.tokensBeforeCursor.length === 0) {
            return true;
        }

        return this.braceDepth === 0 && this.previous?.type === JsoniqLexer.SEMICOLON;
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
