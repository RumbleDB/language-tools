import type { ParseTree } from "antlr4ng";
import { FormatterContext } from "server/formatter/context.js";
import { concat, Doc, NIL, space } from "server/formatter/doc.js";
import { formatBracketedList } from "server/formatter/shared/collections.js";
import { FormatterVisitor } from "server/formatter/visitor.js";
import { JsoniqLexer } from "server/parser/adapters/jsoniq/grammar/JsoniqLexer.js";
import { JsoniqParser } from "server/parser/adapters/jsoniq/grammar/JsoniqParser.js";
import type * as ctx from "server/parser/adapters/jsoniq/grammar/JsoniqParser.js";

/** Formats JSONiq: the shared syntax, and the type declarations, objects and lookups of JSONiq. */
export class JsoniqFormatterVisitor extends FormatterVisitor {
    public constructor(ctx: FormatterContext) {
        super(ctx, { parser: JsoniqParser, literalNames: JsoniqLexer.literalNames });
    }

    public override visitTypeDecl = (node: ctx.TypeDeclContext): Doc => {
        const schema = node.schemaLanguage() ? concat([this.v(node.schemaLanguage()), space]) : NIL;
        return concat([
            this.kw(node.KW_DECLARE(), JsoniqParser.KW_DECLARE),
            space,
            this.kw(node.KW_TYPE(), JsoniqParser.KW_TYPE),
            space,
            this.v(node._type_name),
            space,
            this.kw(node.KW_AS(), JsoniqParser.KW_AS),
            space,
            schema,
            this.v(node._type_definition),
            this.kw(node.SEMICOLON(), JsoniqParser.SEMICOLON),
        ]);
    };

    /** Formats an object constructor, or a merging one, `{| $a, $b |}`. */
    protected override formatObjectConstructor(node: ctx.ObjectConstructorContext): Doc {
        if (node.LBRACE_VBAR() === null) {
            return super.formatObjectConstructor(node);
        }
        // The commas separate the items of the inner expression, so they are its tokens.
        const expression = node.expr();
        return formatBracketedList(
            this.token(node.LBRACE_VBAR(), JsoniqParser.LBRACE_VBAR),
            expression?.exprSingle().map((item) => this.v(item)) ?? [],
            expression?.COMMA() ?? [],
            this.kw(node.RBRACE_VBAR(), JsoniqParser.RBRACE_VBAR),
            this.kw,
        );
    }

    public override visitObjectLookup = (node: ctx.ObjectLookupContext): Doc => {
        return concat([
            this.kw(node.DOT(), JsoniqParser.DOT),
            this.v(node.getChild(1) as ParseTree),
        ]);
    };

    public override visitArrayLookup = (node: ctx.ArrayLookupContext): Doc => {
        return concat([
            this.kw(node.LBRACKET(0), JsoniqParser.LBRACKET),
            this.kw(node.LBRACKET(1), JsoniqParser.LBRACKET),
            this.v(node.expr()),
            this.kw(node.RBRACKET(0), JsoniqParser.RBRACKET),
            this.kw(node.RBRACKET(1), JsoniqParser.RBRACKET),
        ]);
    };

    public override visitArrayUnboxing = (node: ctx.ArrayUnboxingContext): Doc => {
        return concat([
            this.kw(node.LBRACKET(), JsoniqParser.LBRACKET),
            this.kw(node.RBRACKET(), JsoniqParser.RBRACKET),
        ]);
    };
}
