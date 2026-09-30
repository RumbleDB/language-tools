package org.jsoniq.lsp.wrapper;

import static org.junit.jupiter.api.Assertions.*;

import java.util.HashSet;
import java.util.List;
import java.util.stream.Collectors;

import com.fasterxml.jackson.databind.ObjectMapper;
import org.jsoniq.lsp.wrapper.cli.BuiltinConstructors;
import org.jsoniq.lsp.wrapper.types.FunctionDefinition;
import org.junit.jupiter.api.Test;
import org.rumbledb.context.Name;

class BuiltinConstructorsTest {
    private final BuiltinConstructors exporter = new BuiltinConstructors();

    private static FunctionDefinition find(List<FunctionDefinition> functions, String namespace, String localName) {
        return functions.stream()
                .filter(function -> namespace.equals(function.name().qname().namespaceUri()))
                .filter(function -> localName.equals(function.name().qname().localName()))
                .findFirst()
                .orElseThrow();
    }

    @Test
    void exportsAnAtomicConstructorSignature() throws Exception {
        var integer = find(exporter.run().xquery(), Name.XS_NS, "integer");
        assertEquals(1, integer.name().arity());
        assertEquals("xs:anyAtomicType?", integer.signature().parameterTypes().get(0).type().toString());
        assertEquals("xs:integer?", integer.signature().returnType().toString());
    }

    @Test
    void exportsListConstructorsWithSequenceResults() throws Exception {
        var functions = exporter.run().xquery();
        for (var names : List.of(List.of("IDREFS", "IDREF"), List.of("NMTOKENS", "NMTOKEN"), List.of("ENTITIES", "ENTITY"))) {
            var function = find(functions, Name.XS_NS, names.get(0));
            assertEquals("xs:" + names.get(1) + "*", function.signature().returnType().toString());
        }
    }

    @Test
    void preservesJsoniqAliasesAndLanguageDifferences() throws Exception {
        var catalog = exporter.run();
        var alias = find(catalog.jsoniq(), Name.JSONIQ_DEFAULT_FUNCTION_NS, "integer");
        assertEquals(Name.JSONIQ_DEFAULT_FUNCTION_NS, alias.name().qname().namespaceUri());
        assertEquals("xs:integer?", alias.signature().returnType().toString());
        assertTrue(catalog.xquery().stream().allMatch(function -> Name.XS_NS.equals(function.name().qname().namespaceUri())));
        assertFalse(catalog.jsoniq().stream().anyMatch(function ->
                Name.JSONIQ_DEFAULT_FUNCTION_NS.equals(function.name().qname().namespaceUri()) &&
                        List.of("boolean", "string", "QName", "error").contains(function.name().qname().localName())));
        assertNotNull(find(catalog.jsoniq(), Name.XS_NS, "string"));
    }

    @Test
    void excludesNonConstructibleTypesAndDuplicateNames() throws Exception {
        var functions = exporter.run().xquery();
        assertFalse(functions.stream().anyMatch(function -> List.of("anyAtomicType", "NOTATION", "item", "object")
                .contains(function.name().qname().localName())));
        var names = functions.stream().map(FunctionDefinition::name).collect(Collectors.toList());
        assertEquals(names.size(), new HashSet<>(names).size());
        assertTrue(functions.stream().allMatch(function -> function.name().arity() == 1));
    }

    @Test
    void serializesUsingTheExistingFunctionWireFormat() throws Exception {
        var json = new ObjectMapper().valueToTree(exporter.run());
        assertTrue(json.get("jsoniq").isArray());
        assertTrue(json.get("xquery").isArray());
        var constructor = json.get("xquery").get(0);
        assertEquals(1, constructor.get("name").get("arity").asInt());
        assertTrue(constructor.get("signature").get("parameterTypes").isArray());
        assertNotNull(constructor.get("signature").get("returnType").get("itemType"));
    }
}
