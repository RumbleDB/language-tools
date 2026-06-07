package org.jsoniq.lsp.wrapper.types;

import java.util.List;

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

    public record Signature(
            List<String> parameterTypes,
            String returnType) {

        public static Signature create(FunctionSignature signature) {
            List<String> parameterTypes = signature
                    .getParameterTypes()
                    .stream()
                    .map(SequenceType::toString)
                    .toList();

            String returnType = signature.getReturnType() == null ? "item*" : signature.getReturnType().toString();

            return new Signature(
                    parameterTypes,
                    returnType);
        }
    }

    public static FunctionDefinition fromBuiltinFunction(BuiltinFunction function) {
        FunctionIdentifier identifier = function.getIdentifier();
        return new FunctionDefinition(
                FunctionDefinition.Name.create(identifier),
                FunctionDefinition.Signature.create(function.getSignature()));
    }
}
