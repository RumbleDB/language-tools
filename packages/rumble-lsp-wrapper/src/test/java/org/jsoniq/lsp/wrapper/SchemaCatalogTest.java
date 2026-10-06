package org.jsoniq.lsp.wrapper;

import java.net.URI;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.Base64;
import java.util.List;
import java.util.Set;

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
        return new SchemaCatalog.Input(List.of(new SchemaCatalog.Import(namespace, null, List.of(locations))), null);
    }

    @Test
    void resolvesRelativeSchemasAndExportsConstructorSignatures(@TempDir Path directory) throws Exception {
        SchemaCatalog.Result result = this.catalog.resolve(input("urn:test", "types.xsd"), writeSchema(directory));

        assertTrue(result.errors().isEmpty(), result.errors().toString());
        // The endpoint exposes the same files that Xerces actually reads, including includes.
        assertEquals(
                List.of(
                        directory.resolve("types.xsd").toUri(),
                        directory.resolve("common.xsd").toUri()),
                result.dependencies().stream().map(URI::create).toList());
        assertEquals(
                List.of("Code", "CodeOrInteger", "Codes", "Record"),
                result.types().stream().map(type -> type.name().localName()).toList());
        assertTrue(result.types().stream()
                .allMatch(type -> "urn:test".equals(type.name().namespaceUri())
                        && type.name().prefix() == null));
        // A constructor declared by an include must navigate to the include, not the root schema.
        for (var source : result.types()) {
            String file = "Code".equals(source.name().localName()) ? "common.xsd" : "types.xsd";
            assertEquals(directory.resolve(file).toUri(), URI.create(source.sourceUri()));
        }
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
    void retainsTheQueryPrefixOnExportedNames(@TempDir Path directory) throws Exception {
        SchemaCatalog.Result result = this.catalog.resolve(
                new SchemaCatalog.Input(
                        List.of(new SchemaCatalog.Import("urn:test", "demo", List.of("types.xsd"))), null),
                writeSchema(directory));

        assertTrue(result.errors().isEmpty(), result.errors().toString());
        assertTrue(result.types().stream()
                .allMatch(type -> "demo".equals(type.name().prefix())));
        FunctionDefinition code = result.constructors().get(0);
        assertEquals("demo:Code", code.name().qname().toString());
        assertEquals("demo:Code?", code.signature().returnType().toString());
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
                                new SchemaCatalog.Import("urn:test", null, List.of("types.xsd")),
                                new SchemaCatalog.Import("urn:other", null, List.of("other.xsd"))),
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
        // Identical local names in different namespaces must retain their different source files.
        assertEquals(
                List.of(
                        directory.resolve("other.xsd").toUri(),
                        directory.resolve("common.xsd").toUri()),
                result.types().stream()
                        .filter(source -> "Code".equals(source.name().localName()))
                        .map(source -> URI.create(source.sourceUri()))
                        .toList());
    }

    @Test
    void resolvesDeclaredBaseUriBeforeLoadingIncludes(@TempDir Path directory) throws Exception {
        Path schemas = Files.createDirectory(directory.resolve("schemas"));
        writeSchema(schemas);
        // Includes are still resolved relative to the XSD, after applying the query's base URI.
        SchemaCatalog.Input input = new SchemaCatalog.Input(
                List.of(new SchemaCatalog.Import("urn:test", null, List.of("types.xsd"))), "schemas/");
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
        assertTrue(result.types().isEmpty());
    }

    @Test
    void reportsNestedImportsAndIncludes(@TempDir Path directory) throws Exception {
        URI documentUri = writeSchema(directory);
        Path root = directory.resolve("types.xsd");
        Files.writeString(
                root,
                Files.readString(root)
                        .replace(
                                "<xs:include",
                                "<xs:import namespace=\"urn:other\" schemaLocation=\"other.xsd\"/><xs:include"));
        Files.writeString(
                directory.resolve("other.xsd"),
                """
                <xs:schema xmlns:xs="http://www.w3.org/2001/XMLSchema" targetNamespace="urn:other">
                  <xs:include schemaLocation="nested.xsd"/>
                </xs:schema>
                """);
        Files.writeString(
                directory.resolve("nested.xsd"),
                """
                <xs:schema xmlns:xs="http://www.w3.org/2001/XMLSchema" targetNamespace="urn:other">
                  <xs:simpleType name="Other"><xs:restriction base="xs:string"/></xs:simpleType>
                </xs:schema>
                """);
        SchemaCatalog.Result result = this.catalog.resolve(input("urn:test", "types.xsd"), documentUri);
        assertTrue(result.errors().isEmpty(), result.errors().toString());
        // Track the whole loaded graph, rather than only files named in the query prolog.
        assertEquals(
                Set.of("types.xsd", "common.xsd", "other.xsd", "nested.xsd"),
                result.dependencies().stream()
                        .map(uri -> Path.of(URI.create(uri)).getFileName().toString())
                        .collect(java.util.stream.Collectors.toSet()));
        assertEquals(4, result.dependencies().size());
    }

    @Test
    void preservesDependenciesWhenAnIncludedSchemaIsMissing(@TempDir Path directory) throws Exception {
        URI documentUri = writeSchema(directory);
        Files.delete(directory.resolve("common.xsd"));
        SchemaCatalog.Result result = this.catalog.resolve(input("urn:test", "types.xsd"), documentUri);
        assertFalse(result.errors().isEmpty());
        // Keeping the missing URI allows a later file creation to invalidate this failed catalog.
        assertEquals(
                List.of(
                        directory.resolve("types.xsd").toUri(),
                        directory.resolve("common.xsd").toUri()),
                result.dependencies().stream().map(URI::create).toList());
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
        assertEquals(
                List.of(directory.resolve("missing.xsd").toUri()),
                result.dependencies().stream().map(URI::create).toList());
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
        assertEquals(2, json.get("dependencies").size());
        assertEquals("Code", json.at("/types/0/name/localName").asText());
        assertEquals(
                directory.resolve("common.xsd").toUri(),
                URI.create(json.at("/types/0/sourceUri").asText()));
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
