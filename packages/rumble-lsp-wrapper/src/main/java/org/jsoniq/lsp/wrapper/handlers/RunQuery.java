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
import org.rumbledb.bindings.ExternalBindings;
import org.rumbledb.compiler.VisitorHelpers;
import org.rumbledb.config.RumbleConfiguration;
import org.rumbledb.context.DynamicContext;
import org.rumbledb.exceptions.RumbleException;
import org.rumbledb.expressions.module.MainModule;
import org.rumbledb.runtime.RuntimeIterator;

public final class RunQuery implements RequestHandler {
    public static final String REQUEST_TYPE = "run-query";
    public static final Result EMPTY_RESULT = new Result(null, null);

    public record Result(
            String output,
            String error) implements ResponseBody {
    }

    private final RumbleConfiguration configuration;

    public RunQuery() {
        this.configuration = RumbleConfiguration.defaultConfiguration();
    }

    public RunQuery(RumbleConfiguration configuration) {
        this.configuration = configuration;
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
            MainModule module = query != null
                    ? VisitorHelpers.parseMainModuleFromQuery(query, this.configuration,
                            ExternalBindings.empty())
                    : VisitorHelpers.parseMainModuleFromLocation(documentUri, this.configuration,
                            ExternalBindings.empty());

            DynamicContext context = VisitorHelpers.createDynamicContext(module, this.configuration);
            RuntimeIterator iterator = VisitorHelpers.generateRuntimeIterator(module, this.configuration);

            ObjectMapper mapper = new ObjectMapper();
            ArrayNode arrayNode = mapper.createArrayNode();
            iterator.open(context);
            while (iterator.hasNext()) {
                Item item = iterator.next();
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
            iterator.close();

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
