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
import org.rumbledb.exceptions.RumbleException;

public final class StaticTypeChecker implements RequestHandler {

    public record StaticTypeError(String code, String message, String location, Range range) {}

    public record Result(List<StaticTypeError> errors) implements ResponseBody {}

    public static final Result EMPTY_RESULT = new Result(List.of());

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
            parseModule(query, documentUri, this.strictConfiguration);
            return EMPTY_RESULT;
        } catch (RumbleException exception) {
            return new Result(collectErrors(query, documentUri, exception));
        }
    }

    /**
     * Compilation stops at the first error, so the tolerant compiler, which types the rest of the module, finds the
     * others. The first error is kept even if the tolerant compiler does not find it, because it can come from a pass
     * that only compilation runs.
     */
    private List<StaticTypeError> collectErrors(String query, URI documentUri, RumbleException firstError) {
        // Typing visits some expressions more than once, such as FLWOR clauses, which finds their errors again.
        Set<StaticTypeError> errors = new LinkedHashSet<>();
        try {
            TolerantCompiler.compile(
                    query, documentUri, this.strictConfiguration, error -> errors.add(toTypeError(error)));
        } catch (RuntimeException exception) {
            // The first error is still worth reporting.
        }
        StaticTypeError first = toTypeError(firstError);
        if (errors.stream().noneMatch(error -> isSameProblem(error, first))) {
            errors.add(first);
        }
        List<StaticTypeError> sorted = new ArrayList<>(errors);
        sorted.sort(
                Comparator.comparing((StaticTypeError error) -> error.range().start())
                        .thenComparing(error -> error.range().end()));
        return sorted;
    }

    /**
     * Whether an error found by the tolerant compiler is the first error, found in a part of it. Compilation inlines
     * function calls before typing, so it finds a wrong argument at the argument, while the tolerant compiler, which
     * does not inline, finds it at the call.
     */
    private static boolean isSameProblem(StaticTypeError found, StaticTypeError first) {
        return found.code().equals(first.code())
                && Objects.equals(found.location(), first.location())
                && found.range().start().compareTo(first.range().start()) <= 0
                && first.range().end().compareTo(found.range().end()) <= 0;
    }

    private static void parseModule(String query, URI documentUri, RumbleConfiguration configuration) {
        if (isLibraryModule(query)) {
            CompilationPipeline.analyzeLibraryModule(query, documentUri, configuration);
            return;
        }

        CompilationPipeline.compileMainModule(
                query, documentUri, new CompilationConfiguration(configuration), ExternalBindings.empty());
    }

    private static boolean isLibraryModule(String query) {
        return query.matches(
                "(?s)^\\s*(?:\\(:.*?:\\)\\s*)*(?:jsoniq|xquery)?(?:\\s+version\\s+[^;]+;\\s*)?module\\s+namespace\\b.*");
    }

    static StaticTypeError toTypeError(RumbleException exception) {
        ExceptionMetadata metadata =
                exception.getMetadata() == null ? ExceptionMetadata.EMPTY_METADATA : exception.getMetadata();
        String code = exception.getErrorCode().toString();
        String message = Objects.toString(exception.getJSONiqErrorMessage(), exception.getMessage());
        return new StaticTypeError(code, message, metadata.getLocation(), Range.fromExceptionMetadata(metadata));
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
