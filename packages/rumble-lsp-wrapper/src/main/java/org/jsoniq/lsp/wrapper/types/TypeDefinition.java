package org.jsoniq.lsp.wrapper.types;

import org.rumbledb.types.ItemType;

public record TypeDefinition(
        ResolvedQName name) {

    public static TypeDefinition fromItemType(ItemType itemType) {
        return new TypeDefinition(
                itemType.hasName() ? ResolvedQName.fromName(itemType.getName()) : null);
    }

    @Override
    public String toString() {
        return this.name() != null ? this.name().toString() : "anonymous type";
    }
}
