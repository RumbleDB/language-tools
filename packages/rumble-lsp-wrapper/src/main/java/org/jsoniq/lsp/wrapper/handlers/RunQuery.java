package org.jsoniq.lsp.wrapper.handlers;

import java.io.IOException;
import java.net.URI;
import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.Base64;
import java.util.List;
import java.util.Objects;

import org.jsoniq.lsp.wrapper.Range;
import org.jsoniq.lsp.wrapper.messages.Request;
import org.jsoniq.lsp.wrapper.messages.ResponseBody;

import org.rumbledb.api.Item;
import org.rumbledb.api.SequenceOfItems;
import org.rumbledb.bindings.ExternalBindings;
import org.rumbledb.compiler.CompilationPipeline;
import org.rumbledb.compiler.DynamicContextVisitor;
import org.rumbledb.compiler.EffectiveConfigurationVisitor;
import org.rumbledb.compiler.RuntimeIteratorVisitor;
import org.rumbledb.config.CompilationConfiguration;
import org.rumbledb.config.RumbleConfiguration;
import org.rumbledb.exceptions.ExceptionMetadata;
import org.rumbledb.exceptions.RumbleException;

public final class RunQuery implements RequestHandler {
    public static final String REQUEST_TYPE = "run-query";

    public record QueryError(String message, String code, String location, Range range) {
        public static QueryError from(RumbleException exception) {
            String message = Objects.toString(exception.getJSONiqErrorMessage(), exception.getMessage());
            String code = exception.getErrorCode().toString();
            ExceptionMetadata metadata = exception.getMetadata();

            if (metadata == null || metadata == ExceptionMetadata.EMPTY_METADATA) {
                return new QueryError(message, code, null, null);
            }

            return new QueryError(message, code, metadata.getLocation(), Range.fromExceptionMetadata(metadata));
        }
    }

    public record Result(List<QueryResultItem> items, QueryError error) implements ResponseBody {
        public static Result success(List<QueryResultItem> items) {
            return new Result(List.copyOf(items), null);
        }

        public static Result failure(QueryError error) {
            return new Result(null, Objects.requireNonNull(error));
        }
    }

    private static final CompilationConfiguration CONFIGURATION =
            new CompilationConfiguration(RumbleConfiguration.defaultConfiguration());

    private static SequenceOfItems createSequence(String query, URI documentUri) throws IOException {
        // Rumble's constructor eagerly starts Spark. Use the same execution pipeline,
        // allowing engine operations that actually need Spark to initialize it lazily.
        var bindings = ExternalBindings.empty();

        var module = query == null
                ? CompilationPipeline.compileMainModuleFromLocation(documentUri, CONFIGURATION, bindings)
                : CompilationPipeline.compileMainModule(query, documentUri, CONFIGURATION, bindings);
        var configuration = new EffectiveConfigurationVisitor()
                .getEffectiveConfiguration(module, CONFIGURATION.runtimeConfiguration().toBuilder());
        var context = new DynamicContextVisitor(configuration, bindings).visit(module, null);
        var plan = new RuntimeIteratorVisitor(configuration).generateRuntimePlan(module);
        return new SequenceOfItems(plan, context, configuration);
    }

    @Override
    public String getRequestType() {
        return REQUEST_TYPE;
    }

    public Result run(String query, URI documentUri) {
        Objects.requireNonNull(documentUri, "documentUri is required.");

        try {
            SequenceOfItems result = createSequence(query, documentUri);

            List<QueryResultItem> items = new ArrayList<>();

            result.open();
            try {
                // Reuse within this query, including nested items; the XML encoder is mutable.
                var serializer = new QueryResultSerializer();
                while (result.hasNext()) {
                    Item item = result.next();
                    if (item != null) {
                        String serialized;
                        try {
                            serialized = serializer.serialize(item);
                        } catch (RumbleException exception) {
                            QueryError error = QueryError.from(exception);
                            return Result.failure(new QueryError(
                                    "Query evaluated, but result serialization failed for item "
                                            + (items.size() + 1)
                                            + ": "
                                            + error.message(),
                                    error.code(),
                                    error.location(),
                                    error.range()));
                        }
                        items.add(QueryResultItems.from(item, serializer, serialized));
                    }
                }
            } finally {
                result.close();
            }

            return Result.success(items);
        } catch (RumbleException exception) {
            return Result.failure(QueryError.from(exception));
        } catch (Throwable throwable) {
            String errorMessage = Objects.toString(
                    throwable.getMessage(), throwable.getClass().getName());
            return Result.failure(new QueryError(errorMessage, null, null, null));
        }
    }

    @Override
    public ResponseBody handle(Request request) {
        String query = decodeBody(request.body());
        URI documentUri = URI.create(Objects.requireNonNull(request.documentUri(), "documentUri is required."));
        return run(query, documentUri);
    }

    @Override
    public Result createEmptyResponse() {
        return Result.failure(new QueryError("Run-query failed before a result was produced.", null, null, null));
    }

    private static String decodeBody(String body) {
        if (body == null) {
            return null;
        }
        if (body.isBlank()) {
            return "";
        }
        try {
            byte[] decodedBytes = Base64.getDecoder().decode(body);
            return new String(decodedBytes, StandardCharsets.UTF_8);
        } catch (IllegalArgumentException e) {
            return body;
        }
    }
}
