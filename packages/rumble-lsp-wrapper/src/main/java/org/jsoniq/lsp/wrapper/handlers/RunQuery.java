package org.jsoniq.lsp.wrapper.handlers;

import java.net.URI;
import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.Base64;
import java.util.List;
import java.util.Objects;

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

    @Override
    public String getRequestType() {
        return REQUEST_TYPE;
    }

    public Result run(String query, URI documentUri) {
        boolean hasQuery = query != null && !query.isBlank();
        if (!hasQuery && documentUri == null) {
            return EMPTY_RESULT;
        }

        try {
            MainModule module = hasQuery
                    ? (documentUri == null
                            ? VisitorHelpers.parseMainModuleFromQuery(query, this.configuration,
                                    ExternalBindings.empty())
                            : VisitorHelpers.parseMainModule(query, documentUri, this.configuration,
                                    ExternalBindings.empty()))
                    : VisitorHelpers.parseMainModuleFromLocation(documentUri, this.configuration,
                            ExternalBindings.empty());

            DynamicContext context = VisitorHelpers.createDynamicContext(module, this.configuration);
            RuntimeIterator iterator = VisitorHelpers.generateRuntimeIterator(module, this.configuration);

            List<String> results = new ArrayList<>();
            iterator.open(context);
            while (iterator.hasNext()) {
                Item item = iterator.next();
                if (item != null) {
                    results.add(item.serialize());
                }
            }
            iterator.close();

            String output = String.join("\n", results);
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
