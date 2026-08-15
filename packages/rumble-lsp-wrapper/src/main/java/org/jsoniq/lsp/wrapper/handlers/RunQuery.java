package org.jsoniq.lsp.wrapper.handlers;

import java.net.URI;
import java.nio.charset.StandardCharsets;
import java.util.Base64;
import java.util.Objects;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ArrayNode;

import org.jsoniq.lsp.wrapper.messages.Request;
import org.jsoniq.lsp.wrapper.messages.ResponseBody;

import org.rumbledb.api.Item;
import org.rumbledb.api.Rumble;
import org.rumbledb.api.SequenceOfItems;
import org.rumbledb.config.RumbleConfiguration;
import org.rumbledb.exceptions.RumbleException;

public final class RunQuery implements RequestHandler {
    public static final String REQUEST_TYPE = "run-query";
    public static final Result EMPTY_RESULT = new Result(null, null);

    public record Result(
            String output,
            String error) implements ResponseBody {
    }

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
        if (query == null && documentUri == null) {
            return EMPTY_RESULT;
        }

        try {
            SequenceOfItems result = query == null
                    ? getRumble().runQuery(documentUri)
                    : getRumble().runQuery(query);

            ObjectMapper mapper = new ObjectMapper();
            ArrayNode arrayNode = mapper.createArrayNode();

            result.open();
            while (result.hasNext()) {
                Item item = result.next();
                if (item != null) {
                    try {
                        if (item.isObject()) {
                            arrayNode.add(mapper.readTree(item.serialize()));
                        } else if (item.isAtomic()) {
                            if (item.isBoolean()) {
                                arrayNode.add(item.getBooleanValue());
                            } else if (item.isInt() || item.isInteger()) {
                                arrayNode.add(item.getIntValue());
                            } else if (item.isDouble() || item.isDecimal() || item.isFloat()) {
                                arrayNode.add(item.castToDoubleValue());
                            } else {
                                arrayNode.add(item.getStringValue());
                            }
                        } else {
                            arrayNode.add(item.serialize());
                        }
                    } catch (Exception e) {
                        arrayNode.add(item.serialize());
                    }
                }
            }
            result.close();

            String output = mapper.writeValueAsString(arrayNode);
            return new Result(output, null);
        } catch (RumbleException exception) {
            String errorMessage = Objects.toString(exception.getJSONiqErrorMessage(), exception.getMessage());
            return new Result(null, errorMessage);
        } catch (Throwable throwable) {
            String errorMessage = Objects.toString(throwable.getMessage(), throwable.getClass().getName());
            return new Result(null, errorMessage);
        }
    }

    @Override
    public ResponseBody handle(Request request) {
        String query = decodeBody(request.body());
        URI documentUri = request.documentUri() == null ? null : URI.create(request.documentUri());
        return run(query, documentUri);
    }

    @Override
    public ResponseBody createEmptyResponse() {
        return EMPTY_RESULT;
    }

    private static String decodeBody(String body) {
        if (body == null || body.isBlank()) {
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
