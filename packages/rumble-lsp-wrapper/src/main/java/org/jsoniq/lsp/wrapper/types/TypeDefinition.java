package org.jsoniq.lsp.wrapper.types;

import org.rumbledb.types.ItemType;

public record TypeDefinition(
        ResolvedQName name,
        String type,
        ResolvedQName baseType) {

    public static TypeDefinition fromItemType(ItemType itemType) {
        ItemType baseType = itemType.getBaseType();
        return new TypeDefinition(
                itemType.hasName() ? ResolvedQName.fromName(itemType.getName()) : null,
                itemType.toString(),
                baseType != null && baseType.hasName() ? ResolvedQName.fromName(baseType.getName()) : null);
    }

    @Override
    public String toString() {
        return this.name() != null ? this.name().toString() : this.type();
    }
}
