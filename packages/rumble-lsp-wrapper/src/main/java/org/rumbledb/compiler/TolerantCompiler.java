package org.rumbledb.compiler;

import java.net.URI;
import java.util.ArrayList;
import java.util.List;
import java.util.function.UnaryOperator;

import org.antlr.v4.runtime.CharStreams;
import org.antlr.v4.runtime.CommonToken;
import org.antlr.v4.runtime.CommonTokenStream;
import org.antlr.v4.runtime.DefaultErrorStrategy;
import org.antlr.v4.runtime.Parser;
import org.antlr.v4.runtime.ParserRuleContext;
import org.antlr.v4.runtime.Token;
import org.antlr.v4.runtime.tree.ErrorNode;
import org.antlr.v4.runtime.tree.ParseTree;
import org.antlr.v4.runtime.tree.TerminalNodeImpl;
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
import org.rumbledb.expressions.postfix.ObjectLookupExpression;
import org.rumbledb.expressions.primary.VariableReferenceExpression;
import org.rumbledb.expressions.xml.SlashExpr;
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
    /** Removing a broken declaration can expose another one. Each attempt removes one, so this bounds the retries. */
    private static final int MAX_REMOVED_DECLARATIONS = 16;

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
        String source = language == Language.XQUERY ? normalizeXQueryLineEndings(query) : query;
        CompilationConfiguration compilation = new CompilationConfiguration(configuration);

        for (int removed = 0; ; removed++) {
            Parsed parsed = parse(source, uri, compilation, language);
            try {
                return analyze(parsed.translate().get(), compilation);
            } catch (RuntimeException exception) {
                // A prolog declaration is translated outside of any expression, so failures in it are not contained.
                String withoutDeclaration = removed < MAX_REMOVED_DECLARATIONS
                        ? blankFailingDeclaration(source, parsed.prolog(), exception)
                        : null;
                if (withoutDeclaration == null) {
                    throw exception;
                }
                source = withoutDeclaration;
            }
        }
    }

    private record Parsed(java.util.function.Supplier<Module> translate, ParserRuleContext prolog) {}

    private static Parsed parse(String source, URI uri, CompilationConfiguration compilation, Language language) {
        RumbleConfiguration configuration = compilation.runtimeConfiguration();
        StaticContext context = ModuleParser.createModuleContext(uri, configuration);
        // File extensions and version declarations can select a language different from the configured default.
        if (context.getQueryLanguage().language() != language) {
            context.setQueryLanguage(LanguageVersion.defaultFor(language));
        }

        if (language == Language.XQUERY) {
            context.setConstructionPreserve(true);
            XQueryLexer lexer = new XQueryLexer(CharStreams.fromString(source));
            lexer.removeErrorListeners();
            CommonTokenStream tokens = new CommonTokenStream(lexer);
            XQueryParser parser = new XQueryParser(tokens);
            parser.removeErrorListeners();
            parser.setErrorHandler(new DeclarationPreservingErrorStrategy(XQueryParser.SEMICOLON));
            XQueryParser.ModuleContext tree = parser.moduleAndThisIsIt().module();
            boolean isMainModule = tree.libraryModule() == null;
            return new Parsed(
                    () -> (Module) new TolerantXQueryTranslation(context, isMainModule, compilation, source, tokens)
                            .visit(tree),
                    findFirst(tree, XQueryParser.PrologContext.class));
        }

        JsoniqLexer lexer = new JsoniqLexer(CharStreams.fromString(source));
        lexer.removeErrorListeners();
        CommonTokenStream tokens = new CommonTokenStream(lexer);
        JsoniqParser parser = new JsoniqParser(tokens);
        parser.removeErrorListeners();
        parser.setErrorHandler(new DeclarationPreservingErrorStrategy(JsoniqParser.SEMICOLON));
        JsoniqParser.ModuleContext tree = parser.moduleAndThisIsIt().module();
        boolean isMainModule = tree.libraryModule() == null;
        return new Parsed(
                () -> (Module)
                        new TolerantJsoniqTranslation(context, isMainModule, compilation, source, tokens).visit(tree),
                findFirst(tree, JsoniqParser.PrologContext.class));
    }

    /**
     * Keeps the separator after a declaration. By default, the parser deletes it when an expression is expected, as in
     * {@code declare variable $a := ;}, and takes what follows, even the main expression, to be that expression.
     */
    private static final class DeclarationPreservingErrorStrategy extends DefaultErrorStrategy {
        private final int separator;

        DeclarationPreservingErrorStrategy(int separator) {
            this.separator = separator;
        }

        @Override
        protected Token singleTokenDeletion(Parser recognizer) {
            return recognizer.getCurrentToken().getType() == this.separator
                    ? null
                    : super.singleTokenDeletion(recognizer);
        }
    }

    /** The analysis passes of the compilation pipeline that types depend on, without its optimizations. */
    private static Module analyze(Module translated, CompilationConfiguration compilation) {
        RumbleConfiguration configuration = compilation.runtimeConfiguration();
        CompilationContext context =
                new CompilationContext(configuration, ExternalBindings.empty(), compilation.resourceResolver());
        Module module = applyIfPossible(
                translated, m -> CompilationPasses.<Module>pruneModules().apply(m, context));
        module = applyIfPossible(
                module, m -> CompilationPasses.<Module>resolveDependencies().apply(m, context));
        if (module instanceof MainModule main) {
            module = applyIfPossible(main, m -> CompilationPasses.rewriteBuiltinPartialApplications()
                    .apply((MainModule) m, context));
        }
        new TolerantStaticContextVisitor().visit(module, module.getStaticContext());
        new TolerantInferTypeVisitor(context).visit(module, module.getStaticContext());
        return module;
    }

    private static Module applyIfPossible(Module module, UnaryOperator<Module> pass) {
        try {
            return pass.apply(module);
        } catch (RuntimeException exception) {
            return module;
        }
    }

    /**
     * Stands for an expression that cannot be translated. A lookup key or path step gets its own hole, rather than one
     * for the whole expression, so that the type of what it applies to stays known while it is being typed.
     */
    private static Expression hole() {
        return new VariableReferenceExpression(HOLE, ExceptionMetadata.EMPTY_METADATA);
    }

    /**
     * The translation of a FLWOR expression takes the clauses to be all the children except its last two, the return
     * keyword and expression. Recovery may have left any of these out, or added error nodes.
     */
    private static void normalizeFlwor(ParserRuleContext flwor, ParseTree returnExpression) {
        List<ParseTree> children = flwor.children;
        boolean intact = children != null
                && children.size() >= 3
                && children.get(children.size() - 1) == returnExpression
                && children.stream().noneMatch(ErrorNode.class::isInstance);
        if (intact || children == null) {
            return;
        }
        List<ParseTree> normalized = new ArrayList<>();
        for (ParseTree child : children) {
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
                StaticContext context,
                boolean isMainModule,
                CompilationConfiguration compilation,
                String source,
                CommonTokenStream tokens) {
            super(context, isMainModule, compilation, ExternalBindings.empty(), source, tokens);
        }

        @Override
        public Expression visitObjectLookup(JsoniqParser.ObjectLookupContext context) {
            try {
                return super.visitObjectLookup(context);
            } catch (RuntimeException exception) {
                return hole();
            }
        }

        @Override
        public Expression visitStepExpr(JsoniqParser.StepExprContext context) {
            try {
                return super.visitStepExpr(context);
            } catch (RuntimeException exception) {
                return hole();
            }
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
                StaticContext context,
                boolean isMainModule,
                CompilationConfiguration compilation,
                String source,
                CommonTokenStream tokens) {
            super(context, isMainModule, compilation, ExternalBindings.empty(), source, tokens);
        }

        @Override
        public Expression visitStepExpr(XQueryParser.StepExprContext context) {
            try {
                return super.visitStepExpr(context);
            } catch (RuntimeException exception) {
                return hole();
            }
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

        @Override
        public StaticContext visitVariableReference(VariableReferenceExpression expression, StaticContext argument) {
            if (!argument.isInScope(expression.getVariableName())) {
                expression.setActualType(UNKNOWN);
                return argument;
            }
            return super.visitVariableReference(expression, argument);
        }
    }

    private static final class TolerantInferTypeVisitor extends InferTypeVisitor {
        TolerantInferTypeVisitor(CompilationContext context) {
            super(context.configuration(), context.resourceResolver());
        }

        @Override
        public StaticContext visit(Node node, StaticContext argument) {
            StaticContext result = argument;
            try {
                result = super.visit(node, argument);
            } catch (RuntimeException exception) {
                if (node instanceof Expression expression && expression.getStaticSequenceType() == null) {
                    expression.setStaticSequenceType(UNKNOWN);
                }
            }
            if (isLookupOrStepOfHole(node)) {
                ((Expression) node).setStaticSequenceType(UNKNOWN);
            }
            return result;
        }

        /** What a key or step selects is unknown while it is being typed, even if what it applies to is known. */
        private static boolean isLookupOrStepOfHole(Node node) {
            return (node instanceof ObjectLookupExpression || node instanceof SlashExpr)
                    && node.getChildren().stream().anyMatch(child -> isSynthetic(child.getMetadata()));
        }
    }

    /** XQuery normalizes line endings before tokenizing, which RumbleDB's own parsing does as well. */
    private static String normalizeXQueryLineEndings(String query) {
        return query.replace("\r\n", "\n").replace('\r', '\n');
    }

    /**
     * The source with spaces in place of the prolog declaration at fault, or null when there is none. Positions in the
     * rest of the source do not change, and references to the declaration become unknown.
     */
    private static String blankFailingDeclaration(String source, ParserRuleContext prolog, RuntimeException failure) {
        if (prolog == null) {
            return null;
        }
        List<ParserRuleContext> declarations = new ArrayList<>();
        collectDeclarations(prolog, declarations);
        ParserRuleContext declaration = declarationAt(declarations, failure);
        if (declaration == null) {
            declaration = declarations.stream()
                    .filter(TolerantCompiler::hasSyntaxError)
                    .findFirst()
                    // A module that cannot be loaded fails without a location.
                    .or(() -> declarations.stream()
                            .filter(TolerantCompiler::isModuleImport)
                            .findFirst())
                    .orElse(null);
        }
        if (declaration == null) {
            return null;
        }
        Token stop = declaration.getStop() == null ? declaration.getStart() : declaration.getStop();
        // ANTLR indexes code points.
        int[] codePoints = source.codePoints().toArray();
        boolean changed = false;
        for (int i = declaration.getStart().getStartIndex(); i <= stop.getStopIndex() && i < codePoints.length; i++) {
            if (!Character.isWhitespace(codePoints[i])) {
                codePoints[i] = ' ';
                changed = true;
            }
        }
        return changed ? new String(codePoints, 0, codePoints.length) : null;
    }

    private static void collectDeclarations(ParserRuleContext parent, List<ParserRuleContext> declarations) {
        if (parent.children == null) {
            return;
        }
        for (ParseTree child : parent.children) {
            if (child instanceof ParserRuleContext rule && rule.getStart() != null) {
                if (rule.getClass().getSimpleName().equals("PrologHeaderContext")) {
                    collectDeclarations(rule, declarations);
                } else {
                    declarations.add(rule);
                }
            }
        }
    }

    private static boolean isModuleImport(ParserRuleContext declaration) {
        return declaration.getClass().getSimpleName().equals("ModuleImportContext");
    }

    private static ParserRuleContext declarationAt(List<ParserRuleContext> declarations, RuntimeException failure) {
        if (!(failure instanceof RumbleException rumbleException)
                || rumbleException.getMetadata() == null
                || isSynthetic(rumbleException.getMetadata())) {
            return null;
        }
        Position position =
                Range.fromExceptionMetadata(rumbleException.getMetadata()).start();
        for (ParserRuleContext declaration : declarations) {
            if (declaration.getStop() != null
                    && startOf(declaration.getStart()).compareTo(position) <= 0
                    && position.compareTo(endOf(declaration.getStop())) <= 0) {
                return declaration;
            }
        }
        return null;
    }

    private static Position startOf(Token token) {
        return new Position(token.getLine() - 1, token.getCharPositionInLine());
    }

    private static Position endOf(Token token) {
        return new Position(
                token.getLine() - 1, token.getCharPositionInLine() + token.getStopIndex() - token.getStartIndex() + 1);
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

    private static <T extends ParserRuleContext> T findFirst(ParseTree tree, Class<T> type) {
        if (type.isInstance(tree)) {
            return type.cast(tree);
        }
        for (int i = 0; i < tree.getChildCount(); i++) {
            T found = findFirst(tree.getChild(i), type);
            if (found != null) {
                return found;
            }
        }
        return null;
    }
}
