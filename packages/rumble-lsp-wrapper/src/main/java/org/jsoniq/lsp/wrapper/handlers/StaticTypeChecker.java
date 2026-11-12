package org.jsoniq.lsp.wrapper.handlers;

import java.net.URI;
import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.Base64;
import java.util.Comparator;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Objects;
import java.util.Set;

import org.jsoniq.lsp.wrapper.Range;
import org.jsoniq.lsp.wrapper.messages.Request;
import org.jsoniq.lsp.wrapper.messages.ResponseBody;

import org.rumbledb.bindings.ExternalBindings;
import org.rumbledb.compiler.CompilationPipeline;
import org.rumbledb.compiler.TolerantCompiler;
import org.rumbledb.config.CompilationConfiguration;
import org.rumbledb.config.RumbleConfiguration;
import org.rumbledb.exceptions.ExceptionMetadata;
import org.rumbledb.exceptions.NotLibraryModuleException;
import org.rumbledb.exceptions.RumbleException;
import org.rumbledb.exceptions.StaticTypeErrorsException;
import org.rumbledb.exceptions.UnexpectedStaticTypeException;
import org.rumbledb.expressions.module.Module;

public final class StaticTypeChecker implements RequestHandler {

    /**
     * A static type error, which is certain when every value of the expression fails, and otherwise only possible: an
     * item* argument for an xs:integer parameter fails unless it is one integer.
     */
    public record StaticTypeError(String code, String message, String location, Range range, boolean certain) {}

    /**
     * The errors, and the types of the variables that the query binds, which editors show while suggesting variables.
     * The variables are typed even when the query has errors, as far as its valid parts allow.
     */
    public record Result(List<StaticTypeError> errors, List<TypeAtPosition.Binding> bindings) implements ResponseBody {}

    public static final Result EMPTY_RESULT = new Result(List.of(), List.of());

    private final RumbleConfiguration strictConfiguration;

    public StaticTypeChecker() {
        this.strictConfiguration = RumbleConfiguration.builder()
                .configureAnalysis(a -> a.enableStaticTyping(true))
                .build();
    }

    public Result infer(String query, URI documentUri) {
        Objects.requireNonNull(documentUri, "documentUri is required.");
        if (query == null || query.isEmpty()) {
            return EMPTY_RESULT;
        }

        try {
            return new Result(
                    List.of(), TypeAtPosition.bindingsOf(parseModule(query, documentUri, this.strictConfiguration)));
        } catch (RumbleException exception) {
            return typeWithErrors(query, documentUri, compilationErrors(exception));
        }
    }

    /** Static typing reports all of its errors together, while any other pass stops at the first one. */
    private static List<RumbleException> compilationErrors(RumbleException exception) {
        return exception instanceof StaticTypeErrorsException all ? all.getErrors() : List.of(exception);
    }

    /**
     * Compilation reports every static type error, but any other pass stops at the first error, before typing. The
     * tolerant compiler, which also types a module with such an error, finds the type errors in the rest. The errors of
     * compilation are kept even if the tolerant compiler does not find them, because they can come from a pass that
     * only compilation runs. The variables are those that the tolerant compiler types.
     */
    private Result typeWithErrors(String query, URI documentUri, List<RumbleException> compilationErrors) {
        // A problem may be found both by compilation and by the tolerant compiler.
        Set<StaticTypeError> errors = new LinkedHashSet<>();
        List<TypeAtPosition.Binding> bindings = List.of();
        try {
            bindings = TypeAtPosition.bindingsOf(TolerantCompiler.compile(
                    query, documentUri, this.strictConfiguration, error -> errors.add(toTypeError(error))));
        } catch (RuntimeException exception) {
            // The errors of compilation are still worth reporting.
        }
        for (RumbleException compilationError : compilationErrors) {
            StaticTypeError error = toTypeError(compilationError);
            if (errors.stream().noneMatch(found -> isSameProblem(found, error))) {
                errors.add(error);
            }
        }
        List<StaticTypeError> sorted = new ArrayList<>(errors);
        sorted.sort(
                Comparator.comparing((StaticTypeError error) -> error.range().start())
                        .thenComparing(error -> error.range().end()));
        return new Result(sorted, bindings);
    }

    /**
     * Whether an error found by the tolerant compiler is an error of compilation, found in a part of it. Compilation
     * inlines function calls before typing, so it finds a wrong argument at the argument, while the tolerant compiler,
     * which does not inline, finds it at the call.
     */
    private static boolean isSameProblem(StaticTypeError found, StaticTypeError error) {
        return found.code().equals(error.code())
                && Objects.equals(found.location(), error.location())
                && found.range().start().compareTo(error.range().start()) <= 0
                && error.range().end().compareTo(found.range().end()) <= 0;
    }

    /**
     * Lets RumbleDB tell the module kinds apart: it rejects a source that does not start like a library module before
     * analyzing anything. An import that is not a library module is reported as a module that was not found instead,
     * so the rejection is always about this source.
     */
    private static Module parseModule(String query, URI documentUri, RumbleConfiguration configuration) {
        try {
            return CompilationPipeline.analyzeLibraryModule(query, documentUri, configuration);
        } catch (NotLibraryModuleException notALibrary) {
            return CompilationPipeline.compileMainModule(
                    query, documentUri, new CompilationConfiguration(configuration), ExternalBindings.empty());
        }
    }

    static StaticTypeError toTypeError(RumbleException exception) {
        ExceptionMetadata metadata =
                exception.getMetadata() == null ? ExceptionMetadata.EMPTY_METADATA : exception.getMetadata();
        String code = exception.getErrorCode().toString();
        String message = Objects.toString(exception.getJSONiqErrorMessage(), exception.getMessage());
        // Only a type mismatch may be possible. A failed "is statically" assertion, or any other error, is certain.
        boolean certain = !(exception instanceof UnexpectedStaticTypeException mismatch) || mismatch.isCertain();
        return new StaticTypeError(
                code, message, metadata.getLocation(), Range.fromExceptionMetadata(metadata), certain);
    }

    @Override
    public ResponseBody handle(Request request) {
        if (request.body() == null) {
            throw new IllegalArgumentException("Request body is null.");
        }

        byte[] decodedBytes = Base64.getDecoder().decode(request.body());
        String query = new String(decodedBytes, StandardCharsets.UTF_8);
        URI documentUri = URI.create(Objects.requireNonNull(request.documentUri(), "documentUri is required."));
        return infer(query, documentUri);
    }

    @Override
    public ResponseBody createEmptyResponse() {
        return EMPTY_RESULT;
    }

    @Override
    public String getRequestType() {
        return "static-typecheck";
    }
}
