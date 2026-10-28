package org.jsoniq.lsp.wrapper.handlers;

import java.net.URI;
import java.nio.charset.StandardCharsets;
import java.util.Base64;
import java.util.List;
import java.util.Objects;

import org.jsoniq.lsp.wrapper.Range;
import org.jsoniq.lsp.wrapper.messages.Request;
import org.jsoniq.lsp.wrapper.messages.ResponseBody;

import org.rumbledb.bindings.ExternalBindings;
import org.rumbledb.compiler.CompilationPipeline;
import org.rumbledb.config.CompilationConfiguration;
import org.rumbledb.config.RumbleConfiguration;
import org.rumbledb.exceptions.ExceptionMetadata;
import org.rumbledb.exceptions.RumbleException;
import org.rumbledb.exceptions.StaticTypeErrorsException;
import org.rumbledb.exceptions.UnexpectedStaticTypeException;

public final class StaticTypeChecker implements RequestHandler {

    /** An error is certain when every value fails, and otherwise possible, as for an item* argument. */
    public record StaticTypeError(String code, String message, String location, Range range, boolean certain) {}

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
        } catch (StaticTypeErrorsException exception) {
            return new Result(exception.getErrors().stream()
                    .map(StaticTypeChecker::toTypeError)
                    .toList());
        } catch (RumbleException exception) {
            return new Result(List.of(toTypeError(exception)));
        }

        return EMPTY_RESULT;
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
        boolean certain = !(exception instanceof UnexpectedStaticTypeException typeError) || typeError.isCertain();
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
