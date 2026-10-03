package org.jsoniq.lsp.wrapper.handlers;

import java.util.List;

import org.rumbledb.api.Item;
import org.rumbledb.serialization.Serializer;

/** Converts engine values to the wire model using the query's serializer. */
final class QueryResultItems {
    private QueryResultItems() {}

    private static List<QueryResultItem> sequence(List<Item> items, Serializer serializer) {
        return items.stream()
                .map(item -> from(item, serializer, serializer.serialize(item)))
                .toList();
    }

    static QueryResultItem from(Item item, Serializer serializer, String serialized) {
        var dynamicType = item.getDynamicType();
        var type = QueryResultItem.ItemType.from(dynamicType);

        if (item.isNull()) return new QueryResultItem.NullItem(type, serialized);
        // isObject() also accepts object-shaped maps; preserve their actual dynamic kind.
        if (dynamicType.isObjectItemType()) {
            var fields = item.getItemKeys().stream()
                    .map(key -> new QueryResultItem.ObjectField(
                            key.getStringValue(), sequence(item.getSequenceByKey(key), serializer)))
                    .toList();
            return new QueryResultItem.ObjectItem(type, serialized, fields);
        }
        if (item.isMap()) {
            var entries = item.getItemKeys().stream()
                    .map(key -> new QueryResultItem.MapEntry(
                            (QueryResultItem.AtomicValue) from(key, serializer, serializer.serialize(key)),
                            sequence(item.getSequenceByKey(key), serializer)))
                    .toList();
            return new QueryResultItem.MapItem(type, serialized, entries);
        }
        if (item.isArray()) {
            var members = item.getSequenceMembers().stream()
                    .map(member -> sequence(member, serializer))
                    .toList();
            return new QueryResultItem.ArrayItem(type, serialized, members);
        }
        if (item.isNode()) return new QueryResultItem.NodeItem(type, serialized, item.nodeKind());
        if (item.isFunction()) {
            var identifier = item.getIdentifier();
            return new QueryResultItem.FunctionItem(
                    type,
                    serialized,
                    identifier.getName().toString(),
                    identifier.getArity(),
                    item.getSignature().toString());
        }
        return new QueryResultItem.AtomicItem(type, serialized);
    }
}
