package org.jsoniq.lsp.wrapper.types;

import org.rumbledb.types.ItemType;

public record BuiltinTypeDefinition(
        ResolvedQName name,
        String type,
        ResolvedQName baseType) {

    public static BuiltinTypeDefinition fromItemType(ItemType itemType) {
        ItemType baseType = itemType.getBaseType();
        return new BuiltinTypeDefinition(
                ResolvedQName.fromName(itemType.getName()),
                itemType.toString(),
                baseType != null && baseType.hasName() ? ResolvedQName.fromName(baseType.getName()) : null);
    }
}
