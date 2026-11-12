import { TokenContextAnalyzer } from "server/parser/completion-context.js";

import { JsoniqLexer } from "./grammar/JsoniqLexer.js";

export class JsoniqTokenContextAnalyzer extends TokenContextAnalyzer {
    protected override get ncNameTokenType(): number {
        return JsoniqLexer.NCName;
    }

    protected override get colonTokenType(): number {
        return JsoniqLexer.COLON;
    }

    protected override get dollarTokenType(): number {
        return JsoniqLexer.DOLLAR;
    }

    protected override get lexerSymbolicNames(): ReadonlyArray<string | null> {
        return JsoniqLexer.symbolicNames;
    }
}
