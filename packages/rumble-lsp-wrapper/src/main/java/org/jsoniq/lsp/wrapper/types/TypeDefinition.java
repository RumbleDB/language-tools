package org.jsoniq.lsp.wrapper.types;

import org.rumbledb.types.ItemType;
import org.rumbledb.types.FieldDescriptor;

import java.util.LinkedHashMap;
import java.util.Map;

public record TypeDefinition(
        String kind,
        ResolvedQName name,
        Map<String, TypeDefinition> fields) {

    public static TypeDefinition fromItemType(ItemType itemType) {
        if (itemType.isObjectItemType()) {
            Map<String, TypeDefinition> fields = new LinkedHashMap<>();
            for (FieldDescriptor fieldDescriptor : itemType.getObjectContentFacet()) {
                fields.put(
                        fieldDescriptor.getName(),
                        TypeDefinition.fromItemType(fieldDescriptor.getType()));
            }
            return new TypeDefinition(
                    "object",
                    itemType.hasName() ? ResolvedQName.fromName(itemType.getName()) : null,
                    fields);
        }

        if (itemType.isArrayItemType()) {
            return new TypeDefinition(
                    "array",
                    itemType.hasName() ? ResolvedQName.fromName(itemType.getName()) : null,
                    null);
        }

        return new TypeDefinition(
                "named",
                itemType.hasName() ? ResolvedQName.fromName(itemType.getName()) : null,
                null);
    }

    @Override
    public String toString() {
        if (this.kind.equals("object")) {
            String fieldsString = this.fields == null
                    ? ""
                    : this.fields.entrySet().stream()
                            .map(field -> field.getKey() + ": " + field.getValue())
                            .reduce((left, right) -> left + ", " + right)
                            .orElse("");
            return "{ " + fieldsString + " }";
        }

        return this.name() != null ? this.name().toString() : "anonymous type";
    }
}
