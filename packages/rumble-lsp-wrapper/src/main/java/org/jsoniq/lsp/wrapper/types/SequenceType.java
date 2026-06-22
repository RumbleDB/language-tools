package org.jsoniq.lsp.wrapper.types;

public record SequenceType(
        TypeDefinition itemType,
        String arity) {

    public static SequenceType fromSequenceType(org.rumbledb.types.SequenceType type) {
        return new SequenceType(TypeDefinition.fromItemType(type.getItemType()), type.getArity().getSymbol());
    }

    @Override
    public String toString() {
        return itemType.toString() + arity;
    }
}
