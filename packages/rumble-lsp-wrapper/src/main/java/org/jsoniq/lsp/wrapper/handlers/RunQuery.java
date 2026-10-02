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

import org.rumbledb.api.Item;
import org.rumbledb.api.Rumble;
import org.rumbledb.api.SequenceOfItems;
import org.rumbledb.config.RumbleConfiguration;
import org.rumbledb.exceptions.ExceptionMetadata;
import org.rumbledb.exceptions.RumbleException;

public final class RunQuery implements RequestHandler {
    public static final String REQUEST_TYPE = "run-query";
    public static final Result EMPTY_RESULT = new Result(null, null);

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

    public record Result(List<QueryResultItem> items, QueryError error) implements ResponseBody {}

    private static Rumble RUMBLE_INSTANCE = null;

    private static Rumble getRumble() {
        if (RUMBLE_INSTANCE == null) {
            RUMBLE_INSTANCE = new Rumble(RumbleConfiguration.defaultConfiguration());
        }
        return RUMBLE_INSTANCE;
    }

    @Override
    public String getRequestType() {
        return REQUEST_TYPE;
    }

    public Result run(String query, URI documentUri) {
        Objects.requireNonNull(documentUri, "documentUri is required.");

        try {
            SequenceOfItems result = query == null
                    ? getRumble().runQuery(documentUri)
                    : getRumble().runQuery(query, documentUri);

            List<QueryResultItem> items = new ArrayList<>();

            result.open();
            try {
                while (result.hasNext()) {
                    Item item = result.next();
                    if (item != null) {
                        items.add(QueryResultItem.from(item));
                    }
                }
            } finally {
                result.close();
            }

            return new Result(List.copyOf(items), null);
        } catch (RumbleException exception) {
            return new Result(null, QueryError.from(exception));
        } catch (Throwable throwable) {
            String errorMessage = Objects.toString(
                    throwable.getMessage(), throwable.getClass().getName());
            return new Result(null, new QueryError(errorMessage, null, null, null));
        }
    }

    @Override
    public ResponseBody handle(Request request) {
        String query = decodeBody(request.body());
        URI documentUri = URI.create(Objects.requireNonNull(request.documentUri(), "documentUri is required."));
        return run(query, documentUri);
    }

    @Override
    public ResponseBody createEmptyResponse() {
        return EMPTY_RESULT;
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
