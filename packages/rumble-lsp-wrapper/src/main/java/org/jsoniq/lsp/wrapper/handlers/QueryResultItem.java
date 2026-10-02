package org.jsoniq.lsp.wrapper.handlers;

import java.util.List;

import com.fasterxml.jackson.annotation.JsonInclude;

import org.rumbledb.api.Item;
import org.rumbledb.serialization.SerializationParameters;
import org.rumbledb.serialization.Serializers;

/** A typed inspection representation, independent of the legacy JSON output envelope. */
@JsonInclude(JsonInclude.Include.NON_NULL)
public record QueryResultItem(
        String kind,
        String type,
        String typeName,
        @JsonInclude(JsonInclude.Include.ALWAYS) String serialized,
        String serializationError,
        String lexicalValue,
        String nodeKind,
        List<Entry> entries,
        List<List<QueryResultItem>> members,
        FunctionInfo function) {

    public record Entry(QueryResultItem key, List<QueryResultItem> value) {}

    public record FunctionInfo(String name, int arity, String signature) {}

    public static List<QueryResultItem> sequence(List<Item> items) {
        return items.stream().map(QueryResultItem::from).toList();
    }

    public static QueryResultItem from(Item item) {
        String kind = kindOf(item);
        var dynamicType = item.getDynamicType();
        String typeName = null;
        if (dynamicType.hasName()) {
            var name = dynamicType.getName();
            typeName = "Q{" + (name.getNamespace() == null ? "" : name.getNamespace()) + "}" + name.getLocalName();
        }

        String serialized = null;
        String serializationError = null;
        try {
            // Adaptive serialization supports heterogeneous XDM values, including function items,
            // non-string map keys, and array members containing empty or multi-item sequences.
            var parameters = SerializationParameters.defaults();
            parameters.setMethod("adaptive");
            parameters.setIndent(false);
            serialized = Serializers.from(parameters).serialize(item);
        } catch (RuntimeException exception) {
            // A value that cannot be serialized must still be inspectable.
            serializationError =
                    exception.getMessage() == null ? exception.getClass().getSimpleName() : exception.getMessage();
        }

        List<Entry> entries = null;
        if (item.isMap()) {
            entries = item.getItemKeys().stream()
                    .map(key -> new Entry(from(key), sequence(item.getSequenceByKey(key))))
                    .toList();
        }
        List<List<QueryResultItem>> members = item.isArray()
                ? item.getSequenceMembers().stream()
                        .map(QueryResultItem::sequence)
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
                serializationError,
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
