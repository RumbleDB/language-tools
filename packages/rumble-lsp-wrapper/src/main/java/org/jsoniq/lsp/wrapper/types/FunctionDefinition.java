package org.jsoniq.lsp.wrapper.types;

import java.util.List;
import java.util.Map;

import org.rumbledb.context.BuiltinFunction;
import org.rumbledb.context.FunctionIdentifier;
import org.rumbledb.types.FunctionSignature;
import org.rumbledb.types.SequenceType;

public record FunctionDefinition(
        Name name,
        Signature signature) {

    public record Name(
            ResolvedQName qname,
            Integer arity) {

        public static Name create(FunctionIdentifier identifier) {
            return new Name(
                    ResolvedQName.fromName(identifier.getName()),
                    identifier.getArity());
        }
    }

    public record ParameterType(
            ResolvedQName name,
            String sequenceType) {
    }

    public record Signature(
            List<ParameterType> parameters,
            String returnType) {

        public static Signature fromNode(Map<org.rumbledb.context.Name, SequenceType> parameters, SequenceType returnType) {
            List<ParameterType> parameterTypes = parameters.entrySet().stream()
                    .map(entry -> new ParameterType(ResolvedQName.fromName(entry.getKey()), entry.getValue().toString()))
                    .toList();

            return new Signature(
                    parameterTypes,
                    returnType == null ? "item*" : returnType.toString());
        }

        public static Signature fromFunctionSignature(FunctionSignature signature) {
            List<ParameterType> parameterTypes = signature
                    .getParameterTypes()
                    .stream()
                    .map(SequenceType::toString)
                    .map(sequenceType -> new ParameterType(null, sequenceType))
                    .toList();

            String returnType = signature.getReturnType() == null ? "item*" : signature.getReturnType().toString();

            return new Signature(
                    parameterTypes,
                    returnType);
        }
    }

    public static FunctionDefinition fromBuiltinFunction(BuiltinFunction function) {
        return new FunctionDefinition(
                Name.create(function.getIdentifier()),
                Signature.fromFunctionSignature(function.getSignature()));
    }
}
