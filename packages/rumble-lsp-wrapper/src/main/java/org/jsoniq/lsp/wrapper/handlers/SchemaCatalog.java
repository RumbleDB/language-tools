package org.jsoniq.lsp.wrapper.handlers;

import java.net.URI;
import java.nio.charset.StandardCharsets;
import java.util.Base64;
import java.util.List;

import org.jsoniq.lsp.wrapper.messages.Request;
import org.jsoniq.lsp.wrapper.messages.ResponseBody;
import org.jsoniq.lsp.wrapper.types.FunctionDefinition;
import org.jsoniq.lsp.wrapper.types.ResolvedQName;

import org.rumbledb.config.RumbleConfiguration;
import org.rumbledb.context.ConstructorFunctionResolver;
import org.rumbledb.context.FunctionIdentifier;
import org.rumbledb.context.Name;
import org.rumbledb.exceptions.RumbleException;

/** Exports the schema names and constructors visible in a compiled document. */
public final class SchemaCatalog implements RequestHandler {
    public record Result(
            List<ResolvedQName> types,
            List<FunctionDefinition> constructors,
            List<StaticTypeChecker.StaticTypeError> errors)
            implements ResponseBody {}

    private static final Result EMPTY_RESULT = new Result(List.of(), List.of(), List.of());

    public Result resolve(String query, URI documentUri) {
        if (query == null || query.isBlank()) {
            return EMPTY_RESULT;
        }
        try {
            var context = StaticTypeChecker.parseModule(
                            query, documentUri, RumbleConfiguration.builder().build())
                    .getStaticContext();
            var catalog = context.getInScopeSchemaTypes().getXmlSchemaCatalog();
            if (catalog == null) {
                return EMPTY_RESULT;
            }
            // Built-in constructors are exported separately. Prefixes belong to the query, not the schema.
            List<Name> names = catalog.getNamedTypeNames().stream()
                    .filter(name -> !Name.XS_NS.equals(name.getNamespace()))
                    .sorted()
                    .toList();
            List<FunctionDefinition> constructors = names.stream()
                    .map(name -> ConstructorFunctionResolver.resolve(new FunctionIdentifier(name, 1), context))
                    .filter(constructor -> constructor != null)
                    .map(constructor -> new FunctionDefinition(
                            FunctionDefinition.Name.create(constructor.identifier()),
                            FunctionDefinition.Signature.fromFunctionSignature(constructor.signature())))
                    .toList();
            return new Result(names.stream().map(ResolvedQName::fromName).toList(), constructors, List.of());
        } catch (RumbleException exception) {
            return new Result(List.of(), List.of(), List.of(StaticTypeChecker.toTypeError(exception)));
        }
    }

    @Override
    public ResponseBody handle(Request request) {
        if (request.body() == null) {
            throw new IllegalArgumentException("Request body is null.");
        }
        String query = new String(Base64.getDecoder().decode(request.body()), StandardCharsets.UTF_8);
        URI documentUri = request.documentUri() == null ? null : URI.create(request.documentUri());
        return resolve(query, documentUri);
    }

    @Override
    public ResponseBody createEmptyResponse() {
        return EMPTY_RESULT;
    }

    @Override
    public String getRequestType() {
        return "schema-catalog";
    }
}
