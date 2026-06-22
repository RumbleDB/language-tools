package org.jsoniq.lsp.wrapper.types;

import org.rumbledb.context.Name;

public record ResolvedQName(
        String localName,
        String namespaceUri,
        String prefix) {

    public static ResolvedQName fromName(Name name) {
        return new ResolvedQName(
                name.getLocalName(),
                blankToNull(name.getNamespace()),
                blankToNull(name.getPrefix()));
    }

    private static String blankToNull(String value) {
        return value == null || value.isBlank() ? null : value;
    }

    @Override
    public String toString() {
        if (this.prefix() != null) {
            return this.prefix() + ":" + this.localName();
        }
        return this.localName();
    }
}
