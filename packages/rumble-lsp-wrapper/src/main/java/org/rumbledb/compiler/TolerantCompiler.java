package org.rumbledb.compiler;

import java.net.URI;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.function.Consumer;
import java.util.function.Function;
import java.util.function.Supplier;

import org.antlr.v4.runtime.CharStreams;
import org.antlr.v4.runtime.CommonTokenStream;
import org.antlr.v4.runtime.DefaultErrorStrategy;
import org.antlr.v4.runtime.Lexer;
import org.antlr.v4.runtime.Parser;
import org.antlr.v4.runtime.Token;
import org.antlr.v4.runtime.tree.ParseTree;
import org.antlr.v4.runtime.tree.ParseTreeVisitor;

import org.rumbledb.bindings.ExternalBindings;
import org.rumbledb.config.CompilationConfiguration;
import org.rumbledb.config.RumbleConfiguration;
import org.rumbledb.config.model.LanguageVersion;
import org.rumbledb.config.model.LanguageVersion.Language;
import org.rumbledb.context.Name;
import org.rumbledb.context.StaticContext;
import org.rumbledb.exceptions.ExceptionMetadata;
import org.rumbledb.exceptions.RumbleException;
import org.rumbledb.expressions.CommaExpression;
import org.rumbledb.expressions.Expression;
import org.rumbledb.expressions.Node;
import org.rumbledb.expressions.flowr.Clause;
import org.rumbledb.expressions.module.LibraryModule;
import org.rumbledb.expressions.module.MainModule;
import org.rumbledb.expressions.module.Module;
import org.rumbledb.expressions.module.Prolog;
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
 * <p>This class is in RumbleDB's package because it uses the package-private module parser and compilation passes, and
 * extends analysis visitors with package-private constructors. It depends on their internals, so it must be reviewed
 * whenever the RumbleDB version changes.
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
        Parsed parsed = parse(withoutBareCarriageReturns(query), uri, compilation, language);
        return analyze((Module) parsed.translation().visit(parsed.module()), compilation);
    }

    /** Editors count a carriage return as a line ending and the lexer does not. This keeps every offset the same. */
    private static String withoutBareCarriageReturns(String query) {
        return query.replaceAll("\\r(?!\\n)", "\n");
    }

    private record Parsed(ParseTree module, ParseTreeVisitor<Node> translation) {}

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
                    new TolerantXQueryTranslation(context, compilation, source, tokens));
        }

        CommonTokenStream tokens = tokens(new JsoniqLexer(CharStreams.fromString(source)));
        JsoniqParser parser = recovering(new JsoniqParser(tokens));
        return new Parsed(
                parser.moduleAndThisIsIt().module(),
                new TolerantJsoniqTranslation(context, compilation, source, tokens));
    }

    private static CommonTokenStream tokens(Lexer lexer) {
        lexer.removeErrorListeners();
        return new CommonTokenStream(lexer);
    }

    private static <P extends Parser> P recovering(P parser) {
        parser.removeErrorListeners();
        parser.setErrorHandler(new DelimiterPreservingErrorStrategy());
        return parser;
    }

    /**
     * Keeps the delimiter that ends what is being written. By default, the parser deletes it when an expression is
     * expected, if the next token can start one. It would take the main expression after
     * {@code declare variable $a := ;} to be the value of the variable, and {@code </x>} after {@code <x>{$a/}</x>} to
     * be a step, which loses the whole constructor.
     */
    private static final class DelimiterPreservingErrorStrategy extends DefaultErrorStrategy {
        private static final Set<String> DELIMITERS = Set.of(";", ")", "]", "}");

        @Override
        protected Token singleTokenDeletion(Parser recognizer) {
            return DELIMITERS.contains(recognizer.getCurrentToken().getText())
                    ? null
                    : super.singleTokenDeletion(recognizer);
        }
    }

    /** The analysis passes of the compilation pipeline that types depend on, without its optimizations. */
    private static Module analyze(Module translated, CompilationConfiguration compilation) {
        CompilationContext context = new CompilationContext(
                compilation.runtimeConfiguration(), ExternalBindings.empty(), compilation.resourceResolver());
        Module module = resolveDependencies(translated, context);
        if (module instanceof MainModule main) {
            module = CompilationPasses.rewriteBuiltinPartialApplications().apply(main, context);
        }
        new TolerantStaticContextVisitor().visit(module, module.getStaticContext());
        new TolerantInferTypeVisitor(context).visit(module, module.getStaticContext());
        return module;
    }

    /** Dependency analysis stops at a declaration it rejects, such as a duplicate, so that declaration is left out. */
    private static Module resolveDependencies(Module module, CompilationContext context) {
        while (true) {
            try {
                return CompilationPasses.<Module>resolveDependencies().apply(module, context);
            } catch (RumbleException exception) {
                if (!removeDeclaration(prologOf(module), exception.getMetadata())) {
                    throw exception;
                }
            }
        }
    }

    private static Prolog prologOf(Module module) {
        return module instanceof MainModule main ? main.getProlog() : ((LibraryModule) module).getProlog();
    }

    private static boolean removeDeclaration(Prolog prolog, ExceptionMetadata metadata) {
        return prolog != null
                && (prolog.getDeclarations().removeIf(declaration -> declaration.getMetadata() == metadata)
                        || prolog.getImportedModules().stream()
                                .anyMatch(library -> removeDeclaration(library.getProlog(), metadata)));
    }

    /**
     * Stands for an expression that cannot be translated. A lookup key or path step gets its own hole, rather than one
     * for the whole expression, so that the type of what it applies to stays known while it is being typed.
     */
    private static Expression hole() {
        return new VariableReferenceExpression(HOLE, ExceptionMetadata.EMPTY_METADATA);
    }

    /**
     * Translates the expressions of one grammar. One that fails becomes a hole that keeps the expressions inside it, as
     * in the unfinished {@code some $x in $a.} or {@code <x>{$a/}}, so that they can still be typed. Translations are
     * kept, because translating what is inside an expression again for each failing expression around it takes
     * exponential time.
     */
    private static final class ExpressionRecovery<C extends ParseTree> {
        private final Class<C> kind;
        private final Function<C, Expression> visit;
        private final Map<ParseTree, Expression> translated = new HashMap<>();

        ExpressionRecovery(Class<C> kind, Function<C, Expression> visit) {
            this.kind = kind;
            this.visit = visit;
        }

        Expression translate(ParseTree context, Supplier<Expression> translation) {
            // Missing altogether, as the return of an unfinished FLWOR: each one needs a hole of its own.
            if (context == null) {
                return hole();
            }
            Expression known = this.translated.get(context);
            if (known != null) {
                return known;
            }
            Expression result;
            try {
                result = translation.get();
            } catch (RuntimeException exception) {
                result = null;
            }
            // An expression that starts with an error node translates to null without failing.
            if (result == null) {
                result = holeKeepingParts(context);
            }
            this.translated.put(context, result);
            return result;
        }

        private Expression holeKeepingParts(ParseTree context) {
            List<Expression> parts = new ArrayList<>();
            collectParts(context, parts);
            return parts.isEmpty() ? hole() : new CommaExpression(parts, ExceptionMetadata.EMPTY_METADATA);
        }

        private void collectParts(ParseTree tree, List<Expression> parts) {
            for (int i = 0; i < tree.getChildCount(); i++) {
                ParseTree child = tree.getChild(i);
                if (this.kind.isInstance(child)) {
                    parts.add(this.visit.apply(this.kind.cast(child)));
                } else {
                    collectParts(child, parts);
                }
            }
        }
    }

    /** Leaves out a prolog entry that cannot be translated, so that references to it become unknown. */
    private static void translateIfPossible(ParseTree entry, Consumer<ParseTree> translation) {
        try {
            translation.accept(entry);
        } catch (RuntimeException exception) {
            // Everything else in the module is still valid.
        }
    }

    private static final class TolerantJsoniqTranslation extends TranslationVisitor {
        private final ExpressionRecovery<JsoniqParser.ExprSingleContext> recovery =
                new ExpressionRecovery<>(JsoniqParser.ExprSingleContext.class, this::visitExprSingle);

        TolerantJsoniqTranslation(
                StaticContext context, CompilationConfiguration compilation, String source, CommonTokenStream tokens) {
            super(context, compilation, ExternalBindings.empty(), source, tokens);
        }

        @Override
        protected void translatePrologEntry(ParseTree entry, Consumer<ParseTree> translation) {
            translateIfPossible(entry, translation);
        }

        @Override
        public Expression visitObjectLookup(JsoniqParser.ObjectLookupContext context) {
            return this.recovery.translate(context, () -> super.visitObjectLookup(context));
        }

        @Override
        public Expression visitStepExpr(JsoniqParser.StepExprContext context) {
            return this.recovery.translate(context, () -> super.visitStepExpr(context));
        }

        @Override
        public Expression visitExprSingle(JsoniqParser.ExprSingleContext context) {
            return this.recovery.translate(context, () -> super.visitExprSingle(context));
        }
    }

    private static final class TolerantXQueryTranslation extends XQueryTranslationVisitor {
        private final ExpressionRecovery<XQueryParser.ExprSingleContext> recovery =
                new ExpressionRecovery<>(XQueryParser.ExprSingleContext.class, this::visitExprSingle);

        TolerantXQueryTranslation(
                StaticContext context, CompilationConfiguration compilation, String source, CommonTokenStream tokens) {
            super(context, compilation, ExternalBindings.empty(), source, tokens);
        }

        @Override
        protected void translatePrologEntry(ParseTree entry, Consumer<ParseTree> translation) {
            translateIfPossible(entry, translation);
        }

        @Override
        public Expression visitStepExpr(XQueryParser.StepExprContext context) {
            return this.recovery.translate(context, () -> super.visitStepExpr(context));
        }

        @Override
        public Expression visitExprSingle(XQueryParser.ExprSingleContext context) {
            return this.recovery.translate(context, () -> super.visitExprSingle(context));
        }
    }

    private static final class TolerantStaticContextVisitor extends StaticContextVisitor {
        @Override
        public StaticContext visit(Node node, StaticContext argument) {
            try {
                return super.visit(node, argument);
            } catch (RuntimeException exception) {
                // Each clause visits the next one, so the rest of the chain has not been visited if this clause failed.
                if (node instanceof Clause clause
                        && clause.getNextClause() != null
                        && clause.getNextClause().getStaticContext() == null) {
                    visit(clause.getNextClause(), argument);
                }
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
            StaticContext result = argument;
            try {
                result = super.visit(node, argument);
            } catch (RuntimeException exception) {
                if (node instanceof Expression expression) {
                    expression.setStaticSequenceType(UNKNOWN);
                }
            }
            // A hole that keeps parts of the failed expression must not get the type of those parts.
            if (node instanceof Expression expression
                    && (isSynthetic(node.getMetadata()) || isLookupOrStepOfHole(node))) {
                expression.setStaticSequenceType(UNKNOWN);
            }
            return result;
        }

        /** What a key or step selects is unknown while it is being typed, even if what it applies to is known. */
        private static boolean isLookupOrStepOfHole(Node node) {
            return (node instanceof ObjectLookupExpression || node instanceof SlashExpr)
                    && node.getChildren().stream().anyMatch(child -> isSynthetic(child.getMetadata()));
        }
    }
}
