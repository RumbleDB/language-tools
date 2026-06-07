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

    public record Parameter(
            Name name,
            SequenceType type) {
    }

    public record Signature(
            List<Parameter> parameterTypes,
            SequenceType returnType) {

        public static Signature fromFunctionSignature(FunctionSignature signature) {
            List<Parameter> parameterTypes = signature
                    .getParameterTypes()
                    .stream()
                    .map(type -> new Parameter(
                            null,   /// Builtin functions don't have parameter names saved
                            type))
                    .toList();

            SequenceType returnType = signature.getReturnType();

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
