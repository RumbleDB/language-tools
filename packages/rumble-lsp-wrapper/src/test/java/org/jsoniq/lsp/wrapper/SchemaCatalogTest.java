package org.jsoniq.lsp.wrapper;

import java.net.URI;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.Base64;
import java.util.List;

import org.jsoniq.lsp.wrapper.handlers.SchemaCatalog;
import org.jsoniq.lsp.wrapper.messages.Request;
import org.jsoniq.lsp.wrapper.types.FunctionDefinition;
import org.jsoniq.lsp.wrapper.types.ResolvedQName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;

import com.fasterxml.jackson.databind.ObjectMapper;

class SchemaCatalogTest {
    private final SchemaCatalog catalog = new SchemaCatalog();

    private static URI writeSchema(Path directory) throws Exception {
        Files.writeString(
                directory.resolve("types.xsd"),
                """
                <xs:schema xmlns:xs="http://www.w3.org/2001/XMLSchema"
                           xmlns:t="urn:test" targetNamespace="urn:test">
                  <xs:include schemaLocation="common.xsd"/>
                  <xs:simpleType name="Codes"><xs:list itemType="t:Code"/></xs:simpleType>
                  <xs:simpleType name="CodeOrInteger"><xs:union memberTypes="t:Code xs:integer"/></xs:simpleType>
                  <xs:complexType name="Record"><xs:sequence/></xs:complexType>
                  <xs:element name="anonymous"><xs:complexType><xs:sequence/></xs:complexType></xs:element>
                </xs:schema>
                """);
        Files.writeString(
                directory.resolve("common.xsd"),
                """
                <xs:schema xmlns:xs="http://www.w3.org/2001/XMLSchema" targetNamespace="urn:test">
                  <xs:simpleType name="Code"><xs:restriction base="xs:string"/></xs:simpleType>
                </xs:schema>
                """);
        // Only the query URI is needed, not its contents or a file on disk.
        return directory.resolve("query.xq").toUri();
    }

    private static SchemaCatalog.Input input(String namespace, String... locations) {
        return new SchemaCatalog.Input(List.of(new SchemaCatalog.Import(namespace, List.of(locations))), null);
    }

    @Test
    void resolvesRelativeSchemasAndExportsConstructorSignatures(@TempDir Path directory) throws Exception {
        SchemaCatalog.Result result = this.catalog.resolve(input("urn:test", "types.xsd"), writeSchema(directory));

        assertTrue(result.errors().isEmpty(), result.errors().toString());
        assertEquals(
                List.of("Code", "CodeOrInteger", "Codes", "Record"),
                result.types().stream().map(ResolvedQName::localName).toList());
        assertTrue(result.types().stream()
                .allMatch(name -> "urn:test".equals(name.namespaceUri()) && name.prefix() == null));
        assertEquals(
                List.of("Code", "CodeOrInteger", "Codes"),
                result.constructors().stream()
                        .map(function -> function.name().qname().localName())
                        .toList());
        for (FunctionDefinition constructor : result.constructors()) {
            assertEquals(1, constructor.name().arity());
            assertEquals(
                    "xs:anyAtomicType?",
                    constructor.signature().parameterTypes().get(0).type().toString());
            assertEquals("urn:test", constructor.name().qname().namespaceUri());
            assertNull(constructor.name().qname().prefix());
        }
        assertEquals("?", result.constructors().get(0).signature().returnType().arity());
        assertEquals(
                "Code",
                result.constructors()
                        .get(0)
                        .signature()
                        .returnType()
                        .itemType()
                        .name()
                        .localName());
        assertEquals("*", result.constructors().get(2).signature().returnType().arity());
    }

    @Test
    void keepsTypesWithTheSameLocalNameInDifferentNamespaces(@TempDir Path directory) throws Exception {
        URI documentUri = writeSchema(directory);
        Files.writeString(
                directory.resolve("other.xsd"),
                """
                <xs:schema xmlns:xs="http://www.w3.org/2001/XMLSchema" targetNamespace="urn:other">
                  <xs:simpleType name="Code"><xs:restriction base="xs:integer"/></xs:simpleType>
                </xs:schema>
                """);
        SchemaCatalog.Result result = this.catalog.resolve(
                new SchemaCatalog.Input(
                        List.of(
                                new SchemaCatalog.Import("urn:test", List.of("types.xsd")),
                                new SchemaCatalog.Import("urn:other", List.of("other.xsd"))),
                        null),
                documentUri);

        assertTrue(result.errors().isEmpty(), result.errors().toString());
        assertEquals(
                List.of("urn:other", "urn:test"),
                result.constructors().stream()
                        .map(function -> function.name().qname())
                        .filter(name -> "Code".equals(name.localName()))
                        .map(ResolvedQName::namespaceUri)
                        .toList());
    }

    @Test
    void resolvesDeclaredBaseUriBeforeLoadingIncludes(@TempDir Path directory) throws Exception {
        Path schemas = Files.createDirectory(directory.resolve("schemas"));
        writeSchema(schemas);
        // Includes are still resolved relative to the XSD, after applying the query's base URI.
        SchemaCatalog.Input input = new SchemaCatalog.Input(
                List.of(new SchemaCatalog.Import("urn:test", List.of("types.xsd"))), "schemas/");
        SchemaCatalog.Result result =
                this.catalog.resolve(input, directory.resolve("query.xq").toUri());
        assertTrue(result.errors().isEmpty(), result.errors().toString());
        assertEquals(3, result.constructors().size());
    }

    @Test
    void rejectsAMismatchedTargetNamespace(@TempDir Path directory) throws Exception {
        SchemaCatalog.Result result = this.catalog.resolve(input("urn:wrong", "types.xsd"), writeSchema(directory));
        assertFalse(result.errors().isEmpty());
        assertTrue(result.constructors().isEmpty());
    }

    @Test
    void reportsSchemaResolutionErrors(@TempDir Path directory) {
        SchemaCatalog.Result result = this.catalog.resolve(
                input("urn:test", "missing.xsd"), directory.resolve("query.xq").toUri());

        assertFalse(result.errors().isEmpty());
        assertFalse(result.errors().get(0).message().isBlank());
        assertNotNull(result.errors().get(0).range());
        assertTrue(result.types().isEmpty());
        assertTrue(result.constructors().isEmpty());
    }

    @Test
    void returnsNoSchemaEntriesWithoutAnImport() {
        assertEquals(
                this.catalog.createEmptyResponse(),
                this.catalog.resolve(new SchemaCatalog.Input(List.of(), null), null));
    }

    @Test
    void handlesAndSerializesTheDaemonPayload(@TempDir Path directory) throws Exception {
        var mapper = new ObjectMapper();
        Request request = new Request(
                1,
                "schema-catalog",
                Base64.getEncoder().encodeToString(mapper.writeValueAsBytes(input("urn:test", "types.xsd"))),
                writeSchema(directory).toString(),
                null);
        Request decoded = mapper.readValue(mapper.writeValueAsString(request), Request.class);
        var result = (SchemaCatalog.Result) this.catalog.handle(decoded);
        var json = mapper.readTree(mapper.writeValueAsString(result));

        assertTrue(result.errors().isEmpty(), result.errors().toString());
        assertEquals(
                "urn:test", json.at("/constructors/0/name/qname/namespaceUri").asText());
        assertEquals(1, json.at("/constructors/0/name/arity").asInt());
        assertEquals("?", json.at("/constructors/0/signature/returnType/arity").asText());
        assertTrue(json.get("errors").isEmpty());
    }

    @Test
    void rejectsMalformedInput() {
        Request request = new Request(
                1,
                "schema-catalog",
                Base64.getEncoder().encodeToString("{}".getBytes(java.nio.charset.StandardCharsets.UTF_8)),
                "file:///query.xq",
                null);
        assertThrows(IllegalArgumentException.class, () -> this.catalog.handle(request));
        assertThrows(IllegalArgumentException.class, () -> this.catalog.resolve(input("urn:test", "types.xsd"), null));
    }
}
