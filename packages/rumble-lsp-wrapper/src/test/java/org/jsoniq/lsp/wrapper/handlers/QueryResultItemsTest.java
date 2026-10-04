package org.jsoniq.lsp.wrapper.handlers;

import java.util.List;

import org.jsoniq.lsp.wrapper.types.SequenceType;
import org.junit.jupiter.api.Test;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertInstanceOf;
import static org.junit.jupiter.api.Assertions.assertTrue;

import com.fasterxml.jackson.databind.ObjectMapper;

import org.rumbledb.exceptions.ExceptionMetadata;
import org.rumbledb.items.ItemFactory;
import org.rumbledb.serialization.SerializationParameters;
import org.rumbledb.serialization.Serializers;

class QueryResultItemsTest {
    @Test
    void runtimeMapsStayMapsEvenWhenTheirContentsHaveObjectShape() throws Exception {
        var factory = ItemFactory.getInstance();
        var maps = List.of(
                factory.createMapItem(List.of(), List.of(), ExceptionMetadata.EMPTY_METADATA, false),
                factory.createMapItem(factory.createStringItem("name"), List.of(factory.createIntItem(1)), false));
        var parameters = SerializationParameters.defaults();
        parameters.setMethod("adaptive");
        var serializer = Serializers.from(parameters);
        var mapper = new ObjectMapper();
        for (var map : maps) {
            assertTrue(map.isObject());
            var result = assertInstanceOf(
                    QueryResultItem.MapItem.class, QueryResultItems.from(map, serializer, serializer.serialize(map)));
            assertEquals(map.getSize(), result.entries().size());
            var json = mapper.readTree(mapper.writeValueAsString(result));
            assertEquals("map", json.get("kind").asText());
            assertTrue(json.has("entries"));
            assertFalse(json.has("fields"));
        }
    }

    @Test
    void staticAndDynamicTypesUseTheSameDescriptor() throws Exception {
        var item = ItemFactory.getInstance().createIntItem(42);
        var serializer = Serializers.from(SerializationParameters.defaults());
        var result = QueryResultItems.from(item, serializer, serializer.serialize(item));
        var staticType = SequenceType.fromSequenceType(
                new org.rumbledb.types.SequenceType(item.getDynamicType(), org.rumbledb.types.SequenceType.Arity.One));

        assertEquals(staticType.itemType(), result.type());
        var mapper = new ObjectMapper();
        var json = mapper.readTree(mapper.writeValueAsString(result.type()));
        assertEquals("named", json.get("kind").asText());
        assertEquals(item.getDynamicType().toString(), json.get("displayName").asText());
        assertEquals("Q{http://www.w3.org/2001/XMLSchema}int", json.get("qname").asText());
        assertEquals("int", json.get("name").get("localName").asText());
        assertFalse(json.has("fields"));
        assertFalse(json.has("members"));
        assertFalse(json.has("content"));
    }

    @Test
    void nullMapKeysRetainTheirAtomicVariant() {
        var factory = ItemFactory.getInstance();
        var map = factory.createMapItem(factory.createNullItem(), List.of(factory.createStringItem("value")), false);
        var parameters = SerializationParameters.defaults();
        parameters.setMethod("adaptive");
        var serializer = Serializers.from(parameters);
        var result = assertInstanceOf(
                QueryResultItem.MapItem.class, QueryResultItems.from(map, serializer, serializer.serialize(map)));
        assertInstanceOf(QueryResultItem.NullItem.class, result.entries().get(0).key());
        assertEquals("null", result.entries().get(0).key().serialized());
    }
}
