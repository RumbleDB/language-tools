package org.jsoniq.lsp.wrapper.handlers;

import java.net.URI;
import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
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
import org.rumbledb.exceptions.NotLibraryModuleException;
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

        List<StaticTypeError> typeErrors = new ArrayList<>();
        try {
            parseModule(query, documentUri, this.strictConfiguration);
        } catch (RumbleException exception) {
            typeErrors.add(toTypeError(exception));
        }

        return new Result(typeErrors);
    }

    /**
     * Lets RumbleDB tell the module kinds apart: it rejects a source that does not start like a library module before
     * analyzing anything. An import that is not a library module is reported as a module that was not found instead,
     * so the rejection is always about this source.
     */
    private static void parseModule(String query, URI documentUri, RumbleConfiguration configuration) {
        try {
            CompilationPipeline.analyzeLibraryModule(query, documentUri, configuration);
        } catch (NotLibraryModuleException notALibrary) {
            CompilationPipeline.compileMainModule(
                    query, documentUri, new CompilationConfiguration(configuration), ExternalBindings.empty());
        }
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
