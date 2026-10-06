package org.jsoniq.lsp.wrapper.types;

import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.stream.Collectors;

import com.fasterxml.jackson.annotation.JsonInclude;
import com.fasterxml.jackson.annotation.JsonProperty;

import org.rumbledb.types.FieldDescriptor;
import org.rumbledb.types.ItemType;

/** Shared descriptors for inferred static types and query-result dynamic types. */
@JsonInclude(JsonInclude.Include.NON_NULL)
public sealed interface TypeDefinition {
    @JsonProperty("kind")
    String kind();

    @JsonProperty("name")
    default ResolvedQName name() {
        return null;
    }

    String displayName();

    @JsonProperty("qname")
    default String qname() {
        return name() == null ? null : name().expandedName();
    }

    /**
     * Preserve engine display notation, including prefixes retained on schema types. The engine renders anonymous
     * unions, objects and arrays as internal JSON, so those display their descriptor's notation instead.
     */
    static TypeDefinition fromItemType(ItemType itemType) {
        ResolvedQName name = itemType.hasName() ? ResolvedQName.fromName(itemType.getName()) : null;
        String displayName = itemType.toString();
        // Named unions retain their public alias (for example xs:numeric).
        if (itemType.isUnionType() && name == null) {
            List<TypeDefinition> members = itemType.getTypes().stream()
                    .map(TypeDefinition::fromItemType)
                    .toList();
            return new UnionTypeDefinition(null, UnionTypeDefinition.notation(members), members);
        }
        if (itemType.isObjectItemType()) {
            Map<String, ObjectField> fields = new LinkedHashMap<>();
            for (FieldDescriptor fieldDescriptor : itemType.getObjectContentFacet()) {
                fields.put(
                        fieldDescriptor.getName(),
                        new ObjectField(fromItemType(fieldDescriptor.getType()), fieldDescriptor.isRequired()));
            }
            return new ObjectTypeDefinition(
                    name, name == null ? ObjectTypeDefinition.notation(fields) : displayName, fields);
        }
        if (itemType.isArrayItemType()) {
            if (name != null) {
                return new ArrayTypeDefinition(name, displayName, null);
            }
            TypeDefinition content = fromItemType(itemType.getArrayContentFacet());
            // An empty array literal's dynamic type is an anonymous array restricted to length 0.
            boolean empty = Integer.valueOf(0).equals(itemType.getMaxLengthFacet());
            return new ArrayTypeDefinition(null, empty ? "[]" : "[" + content + "]", content);
        }
        return name == null ? new OpaqueTypeDefinition(displayName) : new NamedTypeDefinition(name, displayName);
    }

    record NamedTypeDefinition(ResolvedQName name, String displayName) implements TypeDefinition {
        public NamedTypeDefinition {
            Objects.requireNonNull(name, "name");
            Objects.requireNonNull(displayName, "displayName");
        }

        @Override
        public String kind() {
            return "named";
        }

        @Override
        public String toString() {
            return this.name.toString();
        }
    }

    /** An optional field may be absent from an object; when present, it holds one item of its type. */
    record ObjectField(TypeDefinition type, boolean required) {}

    /** Anonymous types keep their structure; a QName is optional metadata. */
    record ObjectTypeDefinition(ResolvedQName name, String displayName, Map<String, ObjectField> fields)
            implements TypeDefinition {
        public ObjectTypeDefinition {
            Objects.requireNonNull(displayName, "displayName");
            Objects.requireNonNull(fields, "fields");
        }

        @Override
        public String kind() {
            return "object";
        }

        @Override
        public String toString() {
            return notation(this.fields);
        }

        static String notation(Map<String, ObjectField> fields) {
            return fields.entrySet().stream()
                    .map(field -> field.getKey() + (field.getValue().required() ? "" : "?") + ": "
                            + field.getValue().type())
                    .collect(Collectors.joining(", ", "{ ", " }"));
        }
    }

    record ArrayTypeDefinition(ResolvedQName name, String displayName, TypeDefinition content)
            implements TypeDefinition {
        public ArrayTypeDefinition {
            Objects.requireNonNull(displayName, "displayName");
        }

        @Override
        public String kind() {
            return "array";
        }

        @Override
        public String toString() {
            if (this.name != null) return this.name.toString();
            return this.displayName;
        }
    }

    record UnionTypeDefinition(ResolvedQName name, String displayName, List<TypeDefinition> members)
            implements TypeDefinition {
        public UnionTypeDefinition {
            Objects.requireNonNull(displayName, "displayName");
            Objects.requireNonNull(members, "members");
        }

        @Override
        public String kind() {
            return "union";
        }

        @Override
        public String toString() {
            return notation(this.members);
        }

        static String notation(List<TypeDefinition> members) {
            return members.stream().map(TypeDefinition::toString).collect(Collectors.joining(" | ", "(", ")"));
        }
    }

    /** Display-only fallback for anonymous types whose structure is not represented yet. */
    record OpaqueTypeDefinition(String displayName) implements TypeDefinition {
        public OpaqueTypeDefinition {
            Objects.requireNonNull(displayName, "displayName");
        }

        @Override
        public String kind() {
            return "opaque";
        }

        @Override
        public String toString() {
            return this.displayName;
        }
    }
}
