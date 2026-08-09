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
import org.rumbledb.compiler.VisitorHelpers;
import org.rumbledb.config.RumbleConfiguration;
import org.rumbledb.exceptions.ExceptionMetadata;
import org.rumbledb.exceptions.RumbleException;

public final class StaticTypeChecker implements RequestHandler {

    public record StaticTypeError(
            String code,
            String message,
            String location,
            Range range) {
    }

    public record Result(List<StaticTypeError> errors) implements ResponseBody {
    }

    public static final Result EMPTY_RESULT = new Result(List.of());

    private final RumbleConfiguration strictConfiguration;

    public StaticTypeChecker() {
        this.strictConfiguration = RumbleConfiguration.builder().configureAnalysis(a -> a.enableStaticTyping(true)).build();
    }

    public Result infer(String query) {
        return infer(query, null);
    }

    public Result infer(String query, URI documentUri) {
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

    private static void parseModule(
            String query,
            URI documentUri,
            RumbleConfiguration configuration) {
        if (isLibraryModule(query)) {
            VisitorHelpers.parseLibraryModuleFromQuery(
                query,
                documentUri == null ? URI.create(".") : documentUri,
                configuration
            );
            return;
        }

        if (documentUri == null) {
            VisitorHelpers.parseMainModuleFromQuery(query, configuration, ExternalBindings.empty());
            return;
        }

        VisitorHelpers.parseMainModule(query, documentUri, configuration, ExternalBindings.empty());
    }

    private static boolean isLibraryModule(String query) {
        return query.matches("(?s)^\\s*(?:\\(:.*?:\\)\\s*)*(?:jsoniq|xquery)?(?:\\s+version\\s+[^;]+;\\s*)?module\\s+namespace\\b.*");
    }

    private static StaticTypeError toTypeError(RumbleException exception) {
        ExceptionMetadata metadata = exception.getMetadata() == null
                ? ExceptionMetadata.EMPTY_METADATA
                : exception.getMetadata();
        String code = exception.getErrorCode().toString();
        String message = Objects.toString(exception.getJSONiqErrorMessage(), exception.getMessage());
        return new StaticTypeError(
                code,
                message,
                metadata.getLocation(),
                Range.fromExceptionMetadata(metadata));
    }

    @Override
    public ResponseBody handle(Request request) {
        if (request.body() == null) {
            throw new IllegalArgumentException("Request body is null.");
        }

        byte[] decodedBytes = Base64.getDecoder().decode(request.body());
        String query = new String(decodedBytes, StandardCharsets.UTF_8);
        URI documentUri = request.documentUri() == null ? null : URI.create(request.documentUri());
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
