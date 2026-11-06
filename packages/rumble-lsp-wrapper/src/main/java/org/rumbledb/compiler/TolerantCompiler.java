package org.rumbledb.compiler;

import java.net.URI;
import java.util.ArrayList;
import java.util.List;

import org.antlr.v4.runtime.CharStreams;
import org.antlr.v4.runtime.CommonToken;
import org.antlr.v4.runtime.CommonTokenStream;
import org.antlr.v4.runtime.DefaultErrorStrategy;
import org.antlr.v4.runtime.Lexer;
import org.antlr.v4.runtime.Parser;
import org.antlr.v4.runtime.ParserRuleContext;
import org.antlr.v4.runtime.Token;
import org.antlr.v4.runtime.tree.ErrorNode;
import org.antlr.v4.runtime.tree.ParseTree;
import org.antlr.v4.runtime.tree.ParseTreeVisitor;
import org.antlr.v4.runtime.tree.TerminalNodeImpl;
import org.antlr.v4.runtime.tree.Trees;
import org.jsoniq.lsp.wrapper.Position;
import org.jsoniq.lsp.wrapper.Range;

import org.rumbledb.bindings.ExternalBindings;
import org.rumbledb.config.CompilationConfiguration;
import org.rumbledb.config.RumbleConfiguration;
import org.rumbledb.config.model.LanguageVersion;
import org.rumbledb.config.model.LanguageVersion.Language;
import org.rumbledb.context.Name;
import org.rumbledb.context.StaticContext;
import org.rumbledb.exceptions.ExceptionMetadata;
import org.rumbledb.exceptions.RumbleException;
import org.rumbledb.expressions.Expression;
import org.rumbledb.expressions.Node;
import org.rumbledb.expressions.flowr.FlworExpression;
import org.rumbledb.expressions.module.MainModule;
import org.rumbledb.expressions.module.Module;
import org.rumbledb.expressions.primary.VariableReferenceExpression;
import org.rumbledb.parser.jsoniq.JsoniqLexer;
import org.rumbledb.parser.jsoniq.JsoniqParser;
import org.rumbledb.parser.xquery.XQueryLexer;
import org.rumbledb.parser.xquery.XQueryParser;
import org.rumbledb.types.BuiltinTypesCatalogue;
import org.rumbledb.types.SequenceType;

/**
 * Compiles a query that RumbleDB rejects, such as one still being typed, far enough to annotate what is valid with
 * static types. Nothing in the result may be executed. The parser recovers from syntax errors, and an expression that
 * cannot be translated or typed gets the {@link #isUnknown unknown} type, so that the rest of the module is unaffected
 * and every position still refers to the original text.
 *
 * <p>This class is in RumbleDB's package because the visitors it extends have package-private constructors. It depends
 * on their internals, so it must be reviewed whenever the RumbleDB version changes.
 */
public final class TolerantCompiler {
    /** Compared by identity: unlike a declared item*, it means that the type could not be determined. */
    private static final SequenceType UNKNOWN =
            new SequenceType(BuiltinTypesCatalogue.item, SequenceType.Arity.ZeroOrMore);

    private static final Name HOLE = Name.createVariableInNoNamespace("__hole");

    private TolerantCompiler() {}

    /** Whether the type only stands for something that failed to compile. Let bindings pass it on unchanged. */
    public static boolean isUnknown(SequenceType type) {
        return type == UNKNOWN;
    }

    /** Whether the expression has no counterpart in the source, because it replaces a broken one. */
    public static boolean isSynthetic(ExceptionMetadata metadata) {
        return metadata == ExceptionMetadata.EMPTY_METADATA;
    }

    public static Module compile(String query, URI uri, RumbleConfiguration configuration) {
        Language language = ModuleParser.detectLanguage(query, uri, configuration);
        CompilationConfiguration compilation = new CompilationConfiguration(configuration);
        String source = query;
        while (true) {
            Parsed parsed = parse(source, uri, compilation, language);
            try {
                return analyze(parsed.translate(), compilation);
            } catch (RuntimeException exception) {
                // A prolog declaration is translated outside of any expression, so failures in it are not contained.
                String withoutDeclaration = blankFailingDeclaration(source, uri, parsed.prolog(), exception);
                if (withoutDeclaration == null) {
                    throw exception;
                }
                source = withoutDeclaration;
            }
        }
    }

    private record Parsed(ParseTree module, ParseTreeVisitor<Node> translation, int prologRule) {
        Module translate() {
            return (Module) this.translation.visit(this.module);
        }

        ParseTree prolog() {
            return Trees.findAllRuleNodes(this.module, this.prologRule).stream()
                    .findFirst()
                    .orElse(null);
        }
    }

    private static Parsed parse(String source, URI uri, CompilationConfiguration compilation, Language language) {
        StaticContext context = ModuleParser.createModuleContext(uri, compilation.runtimeConfiguration());
        // File extensions and version declarations can select a language different from the configured default.
        if (context.getQueryLanguage().language() != language) {
            context.setQueryLanguage(LanguageVersion.defaultFor(language));
        }

        if (language == Language.XQUERY) {
            CommonTokenStream tokens = tokens(new XQueryLexer(CharStreams.fromString(source)));
            XQueryParser parser = recovering(new XQueryParser(tokens));
            return new Parsed(
                    parser.moduleAndThisIsIt().module(),
                    new TolerantXQueryTranslation(context, compilation, source, tokens),
                    XQueryParser.RULE_prolog);
        }

        CommonTokenStream tokens = tokens(new JsoniqLexer(CharStreams.fromString(source)));
        JsoniqParser parser = recovering(new JsoniqParser(tokens));
        return new Parsed(
                parser.moduleAndThisIsIt().module(),
                new TolerantJsoniqTranslation(context, compilation, source, tokens),
                JsoniqParser.RULE_prolog);
    }

    private static CommonTokenStream tokens(Lexer lexer) {
        lexer.removeErrorListeners();
        return new CommonTokenStream(lexer);
    }

    private static <P extends Parser> P recovering(P parser) {
        parser.removeErrorListeners();
        parser.setErrorHandler(new DeclarationPreservingErrorStrategy());
        return parser;
    }

    /**
     * Keeps the separator after a declaration. By default, the parser deletes it when an expression is expected, as in
     * {@code declare variable $a := ;}, and takes what follows, even the main expression, to be that expression.
     */
    private static final class DeclarationPreservingErrorStrategy extends DefaultErrorStrategy {
        @Override
        protected Token singleTokenDeletion(Parser recognizer) {
            return ";".equals(recognizer.getCurrentToken().getText()) ? null : super.singleTokenDeletion(recognizer);
        }
    }

    /** The analysis passes of the compilation pipeline that types depend on, without its optimizations. */
    private static Module analyze(Module translated, CompilationConfiguration compilation) {
        CompilationContext context = new CompilationContext(
                compilation.runtimeConfiguration(), ExternalBindings.empty(), compilation.resourceResolver());
        Module module = CompilationPasses.<Module>resolveDependencies().apply(translated, context);
        if (module instanceof MainModule main) {
            module = CompilationPasses.rewriteBuiltinPartialApplications().apply(main, context);
        }
        new TolerantStaticContextVisitor().visit(module, module.getStaticContext());
        new TolerantInferTypeVisitor(context).visit(module, module.getStaticContext());
        return module;
    }

    /** Stands for an expression that cannot be translated. */
    private static Expression hole() {
        return new VariableReferenceExpression(HOLE, ExceptionMetadata.EMPTY_METADATA);
    }

    /**
     * The translation of a FLWOR expression takes the clauses to be all the children except its last two, the return
     * keyword and expression. Recovery may have left any of these out, or added error nodes.
     */
    private static void normalizeFlwor(ParserRuleContext flwor, ParseTree returnExpression) {
        List<ParseTree> normalized = new ArrayList<>();
        for (ParseTree child : flwor.children) {
            if (child instanceof ParserRuleContext && child != returnExpression) {
                normalized.add(child);
            }
        }
        normalized.add(new TerminalNodeImpl(new CommonToken(Token.INVALID_TYPE)));
        normalized.add(
                returnExpression != null
                        ? returnExpression
                        : new TerminalNodeImpl(new CommonToken(Token.INVALID_TYPE)));
        flwor.children = normalized;
    }

    private static final class TolerantJsoniqTranslation extends TranslationVisitor {
        TolerantJsoniqTranslation(
                StaticContext context, CompilationConfiguration compilation, String source, CommonTokenStream tokens) {
            super(context, compilation, ExternalBindings.empty(), source, tokens);
        }

        @Override
        public FlworExpression visitFlworExpr(JsoniqParser.FlworExprContext context) {
            normalizeFlwor(context, context.return_expr);
            return super.visitFlworExpr(context);
        }

        @Override
        public Expression visitExprSingle(JsoniqParser.ExprSingleContext context) {
            try {
                return super.visitExprSingle(context);
            } catch (RuntimeException exception) {
                return hole();
            }
        }
    }

    private static final class TolerantXQueryTranslation extends XQueryTranslationVisitor {
        TolerantXQueryTranslation(
                StaticContext context, CompilationConfiguration compilation, String source, CommonTokenStream tokens) {
            super(context, compilation, ExternalBindings.empty(), source, tokens);
        }

        @Override
        public FlworExpression visitFlworExpr(XQueryParser.FlworExprContext context) {
            normalizeFlwor(context, context.return_expr);
            return super.visitFlworExpr(context);
        }

        @Override
        public Expression visitExprSingle(XQueryParser.ExprSingleContext context) {
            try {
                return super.visitExprSingle(context);
            } catch (RuntimeException exception) {
                return hole();
            }
        }
    }

    private static final class TolerantStaticContextVisitor extends StaticContextVisitor {
        @Override
        public StaticContext visit(Node node, StaticContext argument) {
            try {
                return super.visit(node, argument);
            } catch (RuntimeException exception) {
                return argument;
            }
        }
    }

    private static final class TolerantInferTypeVisitor extends InferTypeVisitor {
        TolerantInferTypeVisitor(CompilationContext context) {
            super(context.configuration(), context.resourceResolver());
        }

        @Override
        public StaticContext visit(Node node, StaticContext argument) {
            try {
                return super.visit(node, argument);
            } catch (RuntimeException exception) {
                if (node instanceof Expression expression) {
                    expression.setStaticSequenceType(UNKNOWN);
                }
                return argument;
            }
        }
    }

    /**
     * The source with spaces in place of the prolog declaration at fault, or null when there is none. Positions in the
     * rest of the source do not change, and references to the declaration become unknown.
     */
    private static String blankFailingDeclaration(String source, URI uri, ParseTree prolog, RuntimeException failure) {
        ParserRuleContext declaration = failingDeclaration(uri, prolog, failure);
        if (declaration == null) {
            return null;
        }
        // ANTLR indexes code points.
        int[] codePoints = source.codePoints().toArray();
        boolean changed = false;
        for (int i = declaration.getStart().getStartIndex();
                i <= declaration.getStop().getStopIndex();
                i++) {
            if (!Character.isWhitespace(codePoints[i])) {
                codePoints[i] = ' ';
                changed = true;
            }
        }
        return changed ? new String(codePoints, 0, codePoints.length) : null;
    }

    /**
     * The declaration that the failure is located in. Without such a location, it is the first one with a syntax error,
     * or else the first module import: recovery can leave a tree that fails anywhere, and a broken library fails with a
     * location in its own file. Imports come last because they usually still work, and they come first in the prolog.
     */
    private static ParserRuleContext failingDeclaration(URI uri, ParseTree prolog, RuntimeException failure) {
        if (prolog == null) {
            return null;
        }
        List<ParserRuleContext> declarations = new ArrayList<>();
        for (int i = 0; i < prolog.getChildCount(); i++) {
            if (prolog.getChild(i) instanceof ParserRuleContext declaration && declaration.getStop() != null) {
                declarations.add(declaration);
            }
        }
        if (failure instanceof RumbleException rumbleException
                && rumbleException.getMetadata() != null
                && uri.toString().equals(rumbleException.getMetadata().getLocation())) {
            Position position =
                    Range.fromExceptionMetadata(rumbleException.getMetadata()).start();
            for (ParserRuleContext declaration : declarations) {
                if (startOf(declaration.getStart()).compareTo(position) <= 0
                        && position.compareTo(endOf(declaration.getStop())) <= 0) {
                    return declaration;
                }
            }
        }
        return declarations.stream()
                .filter(TolerantCompiler::hasSyntaxError)
                .findFirst()
                .or(() -> declarations.stream()
                        .filter(TolerantCompiler::isModuleImport)
                        .findFirst())
                .orElse(null);
    }

    private static boolean isModuleImport(ParserRuleContext declaration) {
        return declaration.getChild(0).getClass().getSimpleName().equals("ModuleImportContext");
    }

    private static boolean hasSyntaxError(ParseTree tree) {
        if (tree instanceof ErrorNode || (tree instanceof ParserRuleContext rule && rule.exception != null)) {
            return true;
        }
        for (int i = 0; i < tree.getChildCount(); i++) {
            if (hasSyntaxError(tree.getChild(i))) {
                return true;
            }
        }
        return false;
    }

    private static Position startOf(Token token) {
        return new Position(token.getLine() - 1, token.getCharPositionInLine());
    }

    private static Position endOf(Token token) {
        return new Position(
                token.getLine() - 1, token.getCharPositionInLine() + token.getStopIndex() - token.getStartIndex() + 1);
    }
}
