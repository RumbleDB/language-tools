package org.jsoniq.lsp.wrapper.types;

import java.util.HashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;

import org.junit.jupiter.api.Test;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertInstanceOf;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertThrows;

import com.fasterxml.jackson.databind.ObjectMapper;

import org.rumbledb.types.BuiltinTypesCatalogue;
import org.rumbledb.types.FunctionSignature;
import org.rumbledb.types.ItemTypeFactory;
import org.rumbledb.types.SequenceType;

class TypeDefinitionTest {
    private final ObjectMapper mapper = new ObjectMapper();

    @Test
    void anonymousTypesWithoutModeledStructureAreOpaque() throws Exception {
        var integer = new SequenceType(BuiltinTypesCatalogue.integerItem, SequenceType.Arity.OneOrZero);
        var types = List.of(
                ItemTypeFactory.mapOf(BuiltinTypesCatalogue.stringItem, integer),
                ItemTypeFactory.xqueryArrayOf(integer),
                ItemTypeFactory.createFunctionItemType(new FunctionSignature(List.of(integer), integer)));
        for (var type : types) {
            var descriptor =
                    assertInstanceOf(TypeDefinition.OpaqueTypeDefinition.class, TypeDefinition.fromItemType(type));
            assertEquals(type.toString(), descriptor.toString());
            assertNull(descriptor.name());
            assertNull(descriptor.qname());
            assertProperties(descriptor, "kind", "displayName");
            assertEquals(
                    "opaque", this.mapper.valueToTree(descriptor).get("kind").asText());
        }
    }

    @Test
    void anonymousArraysAndUnionsRetainTheirStructure() throws Exception {
        var array = assertInstanceOf(
                TypeDefinition.ArrayTypeDefinition.class,
                TypeDefinition.fromItemType(
                        ItemTypeFactory.createAnonymousArrayType(BuiltinTypesCatalogue.integerItem)));
        assertNull(array.name());
        assertEquals("[xs:integer]", array.toString());
        assertProperties(array, "kind", "displayName", "content");

        var union = assertInstanceOf(
                TypeDefinition.UnionTypeDefinition.class,
                TypeDefinition.fromItemType(ItemTypeFactory.createObjectFieldType(
                        new SequenceType(BuiltinTypesCatalogue.integerItem, SequenceType.Arity.ZeroOrMore))));
        assertNull(union.name());
        assertEquals(3, union.members().size());
        assertEquals("(xs:integer | [xs:integer] | js:null)", union.toString());
        assertEquals("(xs:integer | [xs:integer] | js:null)", union.displayName());
        assertProperties(union, "kind", "displayName", "members");
    }

    @Test
    void objectsAllowNamesWithoutChangingTheirStructure() throws Exception {
        var integer =
                new TypeDefinition.ObjectField(TypeDefinition.fromItemType(BuiltinTypesCatalogue.integerItem), true);
        for (var descriptor : List.of(
                new TypeDefinition.ObjectTypeDefinition(null, "object", Map.of("value", integer)),
                new TypeDefinition.ObjectTypeDefinition(
                        new ResolvedQName("Record", "urn:test", "t"), "t:Record", Map.of("value", integer)))) {
            assertEquals("{ value: xs:integer }", descriptor.toString());
            if (descriptor.name() == null) {
                assertProperties(descriptor, "kind", "displayName", "fields");
            } else {
                assertEquals("Q{urn:test}Record", descriptor.qname());
                assertProperties(descriptor, "kind", "displayName", "fields", "name", "qname");
            }
        }
    }

    @Test
    void optionalObjectFieldsAreMarked() throws Exception {
        var objects = ItemTypeFactory.createAnonymousObjectType(
                        List.of("a", "b"), List.of(BuiltinTypesCatalogue.integerItem, BuiltinTypesCatalogue.stringItem))
                .findLeastCommonSuperTypeLax(ItemTypeFactory.createAnonymousObjectType(
                        List.of("a"), List.of(BuiltinTypesCatalogue.decimalItem)));
        var merged = assertInstanceOf(TypeDefinition.ObjectTypeDefinition.class, TypeDefinition.fromItemType(objects));
        assertEquals("{ a: xs:decimal, b?: xs:string }", merged.displayName());
        var json = this.mapper.valueToTree(merged).get("fields");
        assertEquals(true, json.get("a").get("required").asBoolean());
        assertEquals("xs:string", json.get("b").get("type").get("displayName").asText());
    }

    @Test
    void namedUnionAliasesStayNamed() throws Exception {
        var numeric = assertInstanceOf(
                TypeDefinition.NamedTypeDefinition.class,
                TypeDefinition.fromItemType(BuiltinTypesCatalogue.numericItem));
        assertEquals("xs:numeric", numeric.toString());
        assertEquals("Q{http://www.w3.org/2001/XMLSchema}numeric", numeric.qname());
        assertProperties(numeric, "kind", "displayName", "name", "qname");
    }

    @Test
    void namedAndOpaqueDescriptorsRequireTheirIdentityOrDisplay() {
        assertThrows(NullPointerException.class, () -> new TypeDefinition.NamedTypeDefinition(null, "xs:integer"));
        assertThrows(NullPointerException.class, () -> new TypeDefinition.OpaqueTypeDefinition(null));
    }

    private void assertProperties(TypeDefinition descriptor, String... expected) throws Exception {
        var json = this.mapper.readTree(this.mapper.writeValueAsString(descriptor));
        var actual = new HashSet<String>();
        json.fieldNames().forEachRemaining(actual::add);
        assertEquals(Set.of(expected), actual);
    }
}
