package org.jsoniq.lsp.wrapper.handlers;

import java.io.IOException;
import java.net.URI;
import java.util.Base64;
import java.util.List;

import org.jsoniq.lsp.wrapper.messages.Request;
import org.jsoniq.lsp.wrapper.messages.ResponseBody;
import org.jsoniq.lsp.wrapper.types.FunctionDefinition;
import org.jsoniq.lsp.wrapper.types.ResolvedQName;

import com.fasterxml.jackson.databind.ObjectMapper;

import org.rumbledb.compiler.utils.URILiteralUtils;
import org.rumbledb.config.CompilationConfiguration;
import org.rumbledb.config.RumbleConfiguration;
import org.rumbledb.context.ConstructorFunctionResolver;
import org.rumbledb.context.FunctionIdentifier;
import org.rumbledb.context.Name;
import org.rumbledb.exceptions.ExceptionMetadata;
import org.rumbledb.exceptions.RumbleException;
import org.rumbledb.expressions.module.SchemaImport;
import org.rumbledb.xml.schema.XmlSchemaCatalogLoader;

/** Exports schema names and constructors without compiling a query. */
public final class SchemaCatalog implements RequestHandler {
    public record Import(String namespaceUri, List<String> locations) {
        public Import {
            if (namespaceUri == null || locations == null) {
                throw new IllegalArgumentException("Schema imports require namespaceUri and locations.");
            }
            locations = List.copyOf(locations);
        }
    }

    /** baseUri is the optional value of declare base-uri, resolved against documentUri. */
    public record Input(List<Import> imports, String baseUri) {
        public Input {
            if (imports == null) throw new IllegalArgumentException("Schema imports are required.");
            imports = List.copyOf(imports);
        }
    }

    private static final ObjectMapper MAPPER = new ObjectMapper();

    public record Result(
            List<ResolvedQName> types,
            List<FunctionDefinition> constructors,
            List<StaticTypeChecker.StaticTypeError> errors)
            implements ResponseBody {}

    private static final Result EMPTY_RESULT = new Result(List.of(), List.of(), List.of());

    public Result resolve(Input input, URI documentUri) {
        if (input.imports().isEmpty()) return EMPTY_RESULT;
        if (documentUri == null || !documentUri.isAbsolute()) {
            throw new IllegalArgumentException("An absolute documentUri is required.");
        }
        var metadata = new ExceptionMetadata(documentUri.toString(), 1, 0, 1, 0, "");
        try {
            URI baseUri = input.baseUri() == null
                    ? documentUri
                    : URILiteralUtils.resolve(documentUri, input.baseUri(), metadata);
            var configuration = RumbleConfiguration.builder().build();
            var imports = input.imports().stream()
                    .map(imported -> new SchemaImport(
                            imported.namespaceUri(),
                            SchemaImport.BindingKind.NONE,
                            null,
                            imported.locations(),
                            metadata))
                    .toList();
            var loaded = XmlSchemaCatalogLoader.load(imports, baseUri, new CompilationConfiguration(configuration));
            if (loaded.isEmpty()) return EMPTY_RESULT;
            var catalog = loaded.get();
            // Built-in constructors are exported separately. Prefixes belong to the query, not the schema.
            List<Name> names = catalog.getNamedTypeNames().stream()
                    .filter(name -> !Name.XS_NS.equals(name.getNamespace()))
                    .sorted()
                    .toList();
            List<FunctionDefinition> constructors = names.stream()
                    .map(name -> ConstructorFunctionResolver.resolveImported(new FunctionIdentifier(name, 1), catalog))
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
        URI documentUri = request.documentUri() == null ? null : URI.create(request.documentUri());
        try {
            Input input = MAPPER.readValue(Base64.getDecoder().decode(request.body()), Input.class);
            if (input == null) throw new IllegalArgumentException("Schema catalog input is null.");
            return resolve(input, documentUri);
        } catch (IOException exception) {
            throw new IllegalArgumentException("Invalid schema catalog input.", exception);
        }
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
