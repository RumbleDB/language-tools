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

    static TypeDefinition fromItemType(ItemType itemType) {
        ResolvedQName name = itemType.hasName() ? ResolvedQName.fromName(itemType.getName()) : null;
        // Keep the engine's display text, including types whose structure we do not yet model.
        String displayName = itemType.toString();
        // Named unions retain their public alias (for example xs:numeric).
        if (itemType.isUnionType() && name == null) {
            return new UnionTypeDefinition(
                    null,
                    displayName,
                    itemType.getTypes().stream()
                            .map(TypeDefinition::fromItemType)
                            .toList());
        }
        if (itemType.isObjectItemType()) {
            Map<String, TypeDefinition> fields = new LinkedHashMap<>();
            for (FieldDescriptor fieldDescriptor : itemType.getObjectContentFacet()) {
                fields.put(fieldDescriptor.getName(), fromItemType(fieldDescriptor.getType()));
            }
            return new ObjectTypeDefinition(name, displayName, fields);
        }
        if (itemType.isArrayItemType()) {
            return new ArrayTypeDefinition(
                    name, displayName, name == null ? fromItemType(itemType.getArrayContentFacet()) : null);
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

    /** Anonymous types keep their structure; a QName is optional metadata. */
    record ObjectTypeDefinition(ResolvedQName name, String displayName, Map<String, TypeDefinition> fields)
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
            return this.fields.entrySet().stream()
                    .map(field -> field.getKey() + ": " + field.getValue())
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
            return this.content == null ? this.displayName : "[" + this.content + "]";
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
            return this.members.stream().map(TypeDefinition::toString).collect(Collectors.joining(" | ", "(", ")"));
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
