package org.jsoniq.lsp.wrapper.handlers;

import java.util.List;

import org.rumbledb.api.Item;
import org.rumbledb.types.ItemType;
import org.rumbledb.types.ItemTypeFactory;

/** Summarizes a query result with the engine's own least-common-supertype join. */
final class ResultTypes {
    private ResultTypes() {}

    /**
     * Joins an item into the type of the items before it, which is null before the first item. A result of objects
     * joins to an object type whose fields are optional when some object lacks them.
     */
    static ItemType join(ItemType previous, Item item) {
        ItemType type = structuralType(item);
        return previous == null ? type : previous.findLeastCommonSuperTypeLax(type);
    }

    /**
     * Objects are described by their fields and arrays by their members, recursively, since their dynamic types are
     * just js:object and js:array.
     */
    private static ItemType structuralType(Item item) {
        ItemType type = item.getDynamicType();
        if (type.isArrayItemType()) {
            // The members' items join to the array's content; an empty array keeps its type, which joins as no content.
            ItemType content = null;
            for (List<Item> member : item.getSequenceMembers()) {
                for (Item memberItem : member) {
                    content = join(content, memberItem);
                }
            }
            return content == null ? type : ItemTypeFactory.createAnonymousArrayType(content);
        }
        if (!type.isObjectItemType()) {
            return type;
        }
        // An object field holds exactly one item, so its value's structural type is the field's type.
        List<Item> keys = item.getItemKeys();
        return ItemTypeFactory.createAnonymousObjectType(
                keys.stream().map(Item::getStringValue).toList(),
                keys.stream().map(key -> structuralType(item.getItemByKey(key))).toList());
    }
}
