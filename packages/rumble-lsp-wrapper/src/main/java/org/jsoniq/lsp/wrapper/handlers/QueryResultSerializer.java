package org.jsoniq.lsp.wrapper.handlers;

import org.rumbledb.api.Item;
import org.rumbledb.serialization.SerializationParameters;
import org.rumbledb.serialization.Serializer;
import org.rumbledb.serialization.Serializers;

/** Serializes result values, with readable XML for element and document nodes. */
final class QueryResultSerializer implements Serializer {
    private final Serializer adaptive;
    private final Serializer xml;

    QueryResultSerializer() {
        var parameters = SerializationParameters.defaults();
        parameters.setMethod("adaptive");
        parameters.setIndent(false);
        this.adaptive = Serializers.from(parameters);

        var xmlParameters = SerializationParameters.defaults();
        xmlParameters.setMethod("xml");
        xmlParameters.setOmitXmlDeclaration(true);
        xmlParameters.setIndent(true);
        xmlParameters.setIndentSpaces(4);
        this.xml = Serializers.from(xmlParameters);
    }

    private Serializer forItem(Item item) {
        return item.isElementNode() || item.isDocumentNode() ? this.xml : this.adaptive;
    }

    @Override
    public String serialize(Item item) {
        return forItem(item).serialize(item);
    }

    @Override
    public void serialize(Item item, StringBuilder sb, String indent, boolean isTopLevel) {
        forItem(item).serialize(item, sb, indent, isTopLevel);
    }
}
