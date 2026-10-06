package org.jsoniq.lsp.wrapper.types;

public record SequenceType(TypeDefinition itemType, String arity) {

    public static SequenceType fromSequenceType(org.rumbledb.types.SequenceType type) {
        // The engine's empty arity symbol is internal ("<void>"); use the standard sequence type syntax.
        if (type.isEmptySequence()) {
            return new SequenceType(new TypeDefinition.OpaqueTypeDefinition("empty-sequence()"), "");
        }
        return new SequenceType(
                TypeDefinition.fromItemType(type.getItemType()), type.getArity().getSymbol());
    }

    @Override
    public String toString() {
        return itemType.toString() + arity;
    }
}
