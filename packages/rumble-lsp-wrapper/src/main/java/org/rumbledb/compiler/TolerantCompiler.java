package org.rumbledb.compiler;

import java.net.URI;
import java.util.function.Consumer;

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
        Parsed parsed = parse(query, uri, compilation, language);
        return analyze((Module) parsed.translation().visit(parsed.module()), compilation);
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

    /** Leaves out a prolog entry that cannot be translated, so that references to it become unknown. */
    private static void translateIfPossible(ParseTree entry, Consumer<ParseTree> translation) {
        try {
            translation.accept(entry);
        } catch (RuntimeException exception) {
            // Everything else in the module is still valid.
        }
    }

    private static final class TolerantJsoniqTranslation extends TranslationVisitor {
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
        protected void translatePrologEntry(ParseTree entry, Consumer<ParseTree> translation) {
            translateIfPossible(entry, translation);
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
}
