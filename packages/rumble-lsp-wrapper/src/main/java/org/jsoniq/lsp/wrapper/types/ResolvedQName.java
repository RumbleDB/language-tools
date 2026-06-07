package org.jsoniq.lsp.wrapper.types;

import org.rumbledb.context.Name;

public record ResolvedQName(
        String localName,
        String namespaceUri,
        String lexicalPrefix) {

    public static ResolvedQName fromName(Name name) {
        return new ResolvedQName(
                name.getLocalName(),
                blankToNull(name.getNamespace()),
                blankToNull(name.getPrefix()));
    }

    private static String blankToNull(String value) {
        return value == null || value.isBlank() ? null : value;
    }
}
