package org.jsoniq.lsp.wrapper.types;

public record SequenceType(
        TypeDefinition type,
        String arity) {

    public static SequenceType fromSequenceType(org.rumbledb.types.SequenceType type) {
        return new SequenceType(TypeDefinition.fromItemType(type.getItemType()), type.getArity().getSymbol());
    }

    @Override
    public String toString() {
        return type.toString() + arity;
    }
}
