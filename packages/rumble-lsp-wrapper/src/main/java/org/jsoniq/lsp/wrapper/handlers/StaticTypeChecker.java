package org.jsoniq.lsp.wrapper.handlers;

import org.jsoniq.lsp.wrapper.Position;
import org.jsoniq.lsp.wrapper.messages.Request;
import org.jsoniq.lsp.wrapper.messages.ResponseBody;
import org.jsoniq.lsp.wrapper.types.FunctionDefinition;
import org.jsoniq.lsp.wrapper.types.ResolvedQName;
import org.jsoniq.lsp.wrapper.types.SequenceType;
import org.rumbledb.compiler.VisitorHelpers;
import org.rumbledb.config.RumbleRuntimeConfiguration;
import org.rumbledb.context.Name;
import org.rumbledb.context.StaticContext;
import org.rumbledb.exceptions.ExceptionMetadata;
import org.rumbledb.exceptions.RumbleException;
import org.rumbledb.expressions.Node;
import org.rumbledb.expressions.flowr.Clause;
import org.rumbledb.expressions.flowr.CountClause;
import org.rumbledb.expressions.flowr.ForClause;
import org.rumbledb.expressions.flowr.GroupByClause;
import org.rumbledb.expressions.flowr.GroupByVariableDeclaration;
import org.rumbledb.expressions.flowr.LetClause;
import org.rumbledb.expressions.module.FunctionDeclaration;
import org.rumbledb.expressions.module.MainModule;
import org.rumbledb.expressions.module.VariableDeclaration;
import org.rumbledb.expressions.primary.InlineFunctionExpression;

import com.fasterxml.jackson.annotation.JsonValue;

import java.nio.charset.StandardCharsets;
import java.net.URI;
import java.util.ArrayList;
import java.util.Base64;
import java.util.List;
import java.util.Objects;

public final class StaticTypeChecker implements RequestHandler {

    public enum VariableKind {
        Declare("declare-variable"),
        Let("let"),
        For("for"),
        ForPosition("for-position"),
        GroupBy("group-by"),
        Count("count");

        private final String value;

        private VariableKind(String value) {
            this.value = value;
        }

        @Override
        @JsonValue
        public String toString() {
            return this.value;
        }
    }

    public interface StaticTypeEntry {
        String kind();

        Position position();
    }

    public record VariableType(
            String kind,
            VariableKind variableKind,
            Position position,
            ResolvedQName qname,
            String sequenceType) implements StaticTypeEntry {
        public VariableType(
                VariableKind variableKind,
                Position position,
                ResolvedQName qname,
                String sequenceType) {
            this("variable", variableKind, position, qname, sequenceType);
        }
    }

    public record FunctionType(
            String kind,
            Position position,
            FunctionDefinition function) implements StaticTypeEntry {
        public FunctionType(
                Position position,
                FunctionDefinition function) {
            this("function", position, function);
        }
    }

    public record StaticTypeError(
            String code,
            String message,
            String location,
            Position position) {
    }

    public record Result(
            List<StaticTypeEntry> types,
            List<StaticTypeError> errors) implements ResponseBody {
    }

    public final static Result EMPTY_RESULT = new Result(List.of(), List.of());

    private final RumbleRuntimeConfiguration permissiveConfiguration;
    private final RumbleRuntimeConfiguration strictConfiguration;

    public StaticTypeChecker() {
        /**
         * We need two separate configuration because when static typing is enabled, the
         * parser will throw an exception as soon as it encounters a type error, which
         * prevents us from collecting available type information for the rest of the
         * query.
         * 
         * So we first parse the query with a permissive configuration (without static
         * typing) to collect as much type information as possible, and then we parse it
         * again with a strict configuration (with static typing) to collect type
         * errors.
         */
        this.permissiveConfiguration = new RumbleRuntimeConfiguration();

        String[] withStaticTyping = { "--static-typing", "yes" };
        this.strictConfiguration = new RumbleRuntimeConfiguration(withStaticTyping);
    }

    public Result infer(String query) {
        return infer(query, null);
    }

    public Result infer(String query, URI documentUri) {
        if (query == null || query.isEmpty()) {
            return EMPTY_RESULT;
        }

        List<StaticTypeEntry> types = new ArrayList<>();
        List<StaticTypeError> typeErrors = new ArrayList<>();

        try {
            MainModule module = parseMainModule(query, documentUri, this.permissiveConfiguration);
            visitNodeAndCollectTypes(module, types);
        } catch (Throwable throwable) {
            /// Because we are using the permissive configuration, the only kind of error we
            /// expect here are parsing errors
            /// We already have parsing error report from Typescript parser, so we don't
            /// need these information
        }

        /// Parse with strict configuration to collect type errors, if any.
        try {
            parseMainModule(query, documentUri, this.strictConfiguration);
        } catch (RumbleException exception) {
            typeErrors.add(toTypeError(exception));
        }

        return new Result(types, typeErrors);
    }

    private static MainModule parseMainModule(
            String query,
            URI documentUri,
            RumbleRuntimeConfiguration configuration) {
        if (documentUri == null) {
            return VisitorHelpers.parseMainModuleFromQuery(query, configuration);
        }

        return VisitorHelpers.parseMainModule(query, documentUri, configuration);
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
                Position.fromExceptionMetadata(metadata));
    }

    /**
     * Recursively visits the AST nodes and collects variable and function types.
     * 
     * @param node  the current AST node being visited
     * @param types the list to collect inferred types into
     */
    private static void visitNodeAndCollectTypes(
            Node node,
            List<StaticTypeEntry> types) {
        if (node == null) {
            return;
        }

        collectFunctionType(node, types);
        collectVariableType(node, types);

        for (Node child : node.getChildren()) {
            visitNodeAndCollectTypes(child, types);
        }
    }

    /**
     * Collects function type from the given AST node if it declares a function
     * 
     * @param node  the AST node to check for function declarations
     * @param types the list to collect inferred types into
     */
    private static void collectFunctionType(
            Node node,
            List<StaticTypeEntry> types) {
        if (!(node instanceof FunctionDeclaration functionDeclaration)) {
            return;
        }

        if (!(functionDeclaration.getExpression() instanceof InlineFunctionExpression functionExpression)) {
            return;
        }

        ExceptionMetadata metadata = functionDeclaration.getMetadata();
        if (metadata == null) {
            return;
        }

        /// I don't add parameters to variable list because we don't have the exact
        /// position of the parameters in the metadata (the metadata only contains the
        /// start position of the function declaration)
        /// But because parameter names are unique within a function, we can still
        /// identify them first by function and then by parameter name
        /// In our LSP, we do have exact position for parameters, so we can complete the
        /// position information for parameters there.
        List<FunctionDefinition.Parameter> parameterTypes = functionExpression.getParams().keySet().stream()
                .map(paramName -> new FunctionDefinition.Parameter(
                        new FunctionDefinition.Name(
                                ResolvedQName.fromName(paramName),
                                null),
                        new SequenceType(functionExpression.getParams().get(paramName))))
                .toList();

        SequenceType returnType = new SequenceType(functionExpression.getReturnType());

        FunctionDefinition function = new FunctionDefinition(
                FunctionDefinition.Name.create(functionDeclaration.getFunctionIdentifier()),
                new FunctionDefinition.Signature(
                        parameterTypes,
                        returnType));

        Position position = Position.fromExceptionMetadata(metadata);
        types.add(new FunctionType(
                position, function));
    }

    /**
     * Collects variable types from the given AST node if it declares variables
     * 
     * @param node  the AST node to check for variable declarations
     * @param types the list to collect inferred types into
     */
    private static void collectVariableType(
            Node node,
            List<StaticTypeEntry> types) {
        if (node instanceof VariableDeclaration variableDeclaration) {
            /// Global variable declaration does not Clause type, we need to handle it
            /// separately
            addDeclaredVariableType(variableDeclaration, types);
            return;
        }

        if (!(node instanceof Clause clause)) {
            return;
        }

        /// Note: we are moving to the next clause's static context because that's where
        /// the current clause's variables are in scope.
        // If we stay in the current clause's static context, we won't find the
        /// variables because they haven't been added to the static context yet.
        StaticContext typeContext = clause.getNextClause() != null
                ? clause.getNextClause().getStaticContext()
                : clause.getStaticContext();

        if (typeContext == null) {
            return;
        }

        if (clause instanceof ForClause forClause) {
            addVariableTypeFromContext(
                    typeContext,
                    forClause.getVariableName(),
                    VariableKind.For,
                    types);

            // Positional variable is optional, so we check if it exists before trying to
            // add its type
            Name positionalVariableName = forClause.getPositionalVariableName();
            if (positionalVariableName != null) {
                addVariableTypeFromContext(
                        typeContext,
                        positionalVariableName,
                        VariableKind.ForPosition,
                        types);
            }
            return;
        }

        if (clause instanceof LetClause letClause) {
            addVariableTypeFromContext(
                    typeContext,
                    letClause.getVariableName(),
                    VariableKind.Let,
                    types);
            return;
        }

        if (clause instanceof CountClause countClause) {
            addVariableTypeFromContext(
                    typeContext,
                    countClause.getCountVariableName(),
                    VariableKind.Count,
                    types);
            return;
        }

        if (clause instanceof GroupByClause groupByClause) {
            for (GroupByVariableDeclaration groupByVariable : groupByClause.getGroupVariables()) {
                addVariableTypeFromContext(
                        typeContext,
                        groupByVariable.getVariableName(),
                        VariableKind.GroupBy,
                        types);
            }
        }
    }

    private static void addDeclaredVariableType(
            VariableDeclaration variableDeclaration,
            List<StaticTypeEntry> types) {
        Name variableName = variableDeclaration.getVariableName();
        ExceptionMetadata metadata = variableDeclaration.getMetadata();
        if (variableName == null || metadata == null) {
            return;
        }

        SequenceType variableType = new SequenceType(variableDeclaration.getSequenceType());
        Position position = Position.fromExceptionMetadata(metadata);
        types.add(new VariableType(
                VariableKind.Declare,
                position,
                ResolvedQName.fromName(variableName),
                variableType.toString()));
    }

    /**
     * Adds a variable type to the list of variable types based on the static
     * context and variable name.
     * 
     * @param context      the static context to retrieve the variable type from
     * @param variableName the name of the variable to retrieve the type for
     * @param kind         the kind of AST node that declares the variable (e.g.,
     *                     "ForVariableDeclaration")
     * @param types        the list to add the variable type to
     */
    private static void addVariableTypeFromContext(
            StaticContext context,
            Name variableName,
            VariableKind kind,
            List<StaticTypeEntry> types) {
        if (context == null || variableName == null) {
            return;
        }

        try {
            SequenceType variableType = new SequenceType(context.getVariableSequenceType(variableName));
            ExceptionMetadata metadata = context.getVariableMetadata(variableName);
            Position position = Position.fromExceptionMetadata(metadata);
            types.add(new VariableType(
                    kind,
                    position,
                    ResolvedQName.fromName(variableName),
                    variableType.toString()));
        } catch (Throwable ignored) {
        }
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
