package org.jsoniq.lsp.wrapper.handlers;

import java.util.List;

import com.fasterxml.jackson.annotation.JsonInclude;
import com.fasterxml.jackson.annotation.JsonProperty;

/** Typed inspection data; each kind carries only its own structure. */
@JsonInclude(JsonInclude.Include.NON_NULL)
public sealed interface QueryResultItem {
    @JsonProperty("kind")
    String kind();

    ItemType type();

    String serialized();

    @JsonInclude(JsonInclude.Include.NON_NULL)
    record ItemType(String displayName, String qname) {}

    /** The engine permits atomic keys, including its null item, in maps. */
    sealed interface AtomicValue extends QueryResultItem {}

    record AtomicItem(ItemType type, String serialized) implements AtomicValue {
        @Override
        public String kind() {
            return "atomic";
        }
    }

    record NullItem(ItemType type, String serialized) implements AtomicValue {
        @Override
        public String kind() {
            return "null";
        }
    }

    /** Object fields have literal names, rather than typed map keys. */
    record ObjectItem(ItemType type, String serialized, List<ObjectField> fields)
            implements QueryResultItem {
        @Override
        public String kind() {
            return "object";
        }
    }

    record ObjectField(String name, List<QueryResultItem> value) {}

    record MapItem(ItemType type, String serialized, List<MapEntry> entries)
            implements QueryResultItem {
        @Override
        public String kind() {
            return "map";
        }
    }

    record MapEntry(AtomicValue key, List<QueryResultItem> value) {}

    /** Array members are sequences; an empty member is different from an empty array. */
    record ArrayItem(ItemType type, String serialized, List<List<QueryResultItem>> members)
            implements QueryResultItem {
        @Override
        public String kind() {
            return "array";
        }
    }

    record NodeItem(ItemType type, String serialized, String nodeKind) implements QueryResultItem {
        @Override
        public String kind() {
            return "node";
        }
    }

    record FunctionItem(ItemType type, String serialized, String name, int arity, String signature)
            implements QueryResultItem {
        @Override
        public String kind() {
            return "function";
        }
    }
}
