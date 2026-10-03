package org.jsoniq.lsp.wrapper.handlers;

import java.util.List;

import com.fasterxml.jackson.annotation.JsonInclude;

import org.rumbledb.api.Item;
import org.rumbledb.serialization.Serializer;

/** A typed result item with successful adaptive serialization. */
@JsonInclude(JsonInclude.Include.NON_NULL)
public record QueryResultItem(
        String kind,
        String type,
        String typeName,
        String serialized,
        String lexicalValue,
        String nodeKind,
        List<Entry> entries,
        List<List<QueryResultItem>> members,
        FunctionInfo function) {

    public record Entry(QueryResultItem key, List<QueryResultItem> value) {}

    public record FunctionInfo(String name, int arity, String signature) {}

    public static List<QueryResultItem> sequence(List<Item> items, Serializer serializer) {
        return items.stream().map(item -> from(item, serializer)).toList();
    }

    public static QueryResultItem from(Item item, Serializer serializer) {
        String kind = kindOf(item);
        var dynamicType = item.getDynamicType();
        String typeName = null;
        if (dynamicType.hasName()) {
            var name = dynamicType.getName();
            typeName = "Q{" + (name.getNamespace() == null ? "" : name.getNamespace()) + "}" + name.getLocalName();
        }

        String serialized = serializer.serialize(item);

        List<Entry> entries = null;
        if (item.isMap()) {
            entries = item.getItemKeys().stream()
                    .map(key -> new Entry(from(key, serializer), sequence(item.getSequenceByKey(key), serializer)))
                    .toList();
        }
        List<List<QueryResultItem>> members = item.isArray()
                ? item.getSequenceMembers().stream()
                        .map(sequence -> sequence(sequence, serializer))
                        .toList()
                : null;
        FunctionInfo function = null;
        if (kind.equals("function")) {
            var identifier = item.getIdentifier();
            function = new FunctionInfo(
                    identifier.getName().toString(),
                    identifier.getArity(),
                    item.getSignature().toString());
        }
        return new QueryResultItem(
                kind,
                dynamicType.toString(),
                typeName,
                serialized,
                item.isAtomic() && !item.isNull() ? item.getStringValue() : null,
                item.isNode() ? item.nodeKind() : null,
                entries,
                members,
                function);
    }

    private static String kindOf(Item item) {
        // Objects, maps, and arrays must be classified before generic function items.
        if (item.isNull()) return "null";
        if (item.isObject()) return "object";
        if (item.isMap()) return "map";
        if (item.isArray()) return "array";
        if (item.isNode()) return "node";
        if (item.isFunction()) return "function";
        return "atomic";
    }
}
