package org.jsoniq.lsp.wrapper;

import java.net.URI;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.Base64;

import org.jsoniq.lsp.wrapper.handlers.RunQuery;
import org.jsoniq.lsp.wrapper.messages.Request;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;

import static org.junit.jupiter.api.Assertions.assertDoesNotThrow;
import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertTrue;

import org.rumbledb.exceptions.ExceptionMetadata;
import org.rumbledb.exceptions.RumbleException;

class RunQueryTest {
    private static final URI DOCUMENT_URI = URI.create("file:///run-query");

    private final RunQuery runQuery = new RunQuery();

    @Test
    void preservesMixedJsoniqItemsAndNestedTypes() {
        RunQuery.Result result = this.runQuery.run("(42, \"42\", true, null, {\"n\": 7}, [1, [2]])", DOCUMENT_URI);
        assertNull(result.error());
        assertEquals(
                java.util.List.of("atomic", "atomic", "atomic", "null", "object", "array"),
                result.items().stream().map(item -> item.kind()).toList());
        assertEquals("42", result.items().get(0).lexicalValue());
        assertEquals("42", result.items().get(1).lexicalValue());
        assertTrue(!result.items().get(0).type().equals(result.items().get(1).type()));
        assertEquals("n", result.items().get(4).entries().get(0).key().lexicalValue());
        assertEquals("7", result.items().get(4).entries().get(0).value().get(0).lexicalValue());
        assertEquals("array", result.items().get(5).members().get(1).get(0).kind());
        assertEquals(
                "2",
                result.items()
                        .get(5)
                        .members()
                        .get(1)
                        .get(0)
                        .members()
                        .get(0)
                        .get(0)
                        .lexicalValue());
    }

    @Test
    void distinguishesEmptySequenceNullEmptyStringAndEmptyArray() {
        RunQuery.Result empty = this.runQuery.run("()", DOCUMENT_URI);
        assertNull(empty.error());
        assertEquals(java.util.List.of(), empty.items());
        RunQuery.Result result = this.runQuery.run("(null, \"\", [])", DOCUMENT_URI);
        assertNull(result.error());
        assertEquals(3, result.items().size());
        assertEquals("null", result.items().get(0).kind());
        assertEquals("", result.items().get(1).lexicalValue());
        assertEquals(java.util.List.of(), result.items().get(2).members());
    }

    @Test
    void preservesNumericPrecisionAndAtomicTypeNames() {
        RunQuery.Result result = this.runQuery.run(
                "(xs:integer(\"123456789012345678901234567890\"), xs:decimal(\"0.12345678901234567890123456789\"), xs:date(\"2026-10-02\"))",
                DOCUMENT_URI);
        assertNull(result.error());
        assertEquals("123456789012345678901234567890", result.items().get(0).lexicalValue());
        assertEquals("0.12345678901234567890123456789", result.items().get(1).lexicalValue());
        assertEquals(
                "Q{http://www.w3.org/2001/XMLSchema}date", result.items().get(2).typeName());
        assertEquals("2026-10-02", result.items().get(2).lexicalValue());
    }

    @Test
    void distinguishesXmlNodesFromStringsContainingXml() {
        RunQuery.Result result = this.runQuery.run("xquery version \"3.1\"; (<book/>, \"<book/>\")", DOCUMENT_URI);
        assertNull(result.error());
        assertEquals("node", result.items().get(0).kind());
        assertEquals("element", result.items().get(0).nodeKind());
        assertTrue(result.items().get(0).serialized().contains("book"));
        assertEquals("atomic", result.items().get(1).kind());
        assertEquals("<book/>", result.items().get(1).lexicalValue());
    }

    @Test
    void preservesTypedMapKeysAndSequenceValuedEntriesAndArrayMembers() {
        RunQuery.Result result = this.runQuery.run(
                "xquery version \"3.1\"; (map {1: (\"a\", \"b\"), \"1\": ()}, [(), (1, 2), [3]])", DOCUMENT_URI);
        assertNull(result.error());
        var map = result.items().get(0);
        assertEquals("map", map.kind());
        assertEquals(2, map.entries().size());
        var numericEntry = map.entries().stream()
                .filter(entry -> entry.key().typeName().endsWith("}int")
                        || entry.key().typeName().endsWith("}integer"))
                .findFirst()
                .orElseThrow();
        assertEquals(2, numericEntry.value().size());
        var stringEntry = map.entries().stream()
                .filter(entry -> entry.key().typeName().endsWith("}string"))
                .findFirst()
                .orElseThrow();
        assertEquals(java.util.List.of(), stringEntry.value());
        assertNull(map.serializationError());
        var array = result.items().get(1);
        assertEquals(java.util.List.of(), array.members().get(0));
        assertEquals(2, array.members().get(1).size());
        assertEquals("array", array.members().get(2).get(0).kind());
    }

    @Test
    void returningAFunctionDoesNotFailSerialization() {
        RunQuery.Result result = this.runQuery.run("xquery version \"3.1\"; fn:concat#2", DOCUMENT_URI);
        assertNull(result.error());
        var function = result.items().get(0);
        assertEquals("function", function.kind());
        assertEquals(2, function.function().arity());
        assertTrue(function.function().name().contains("concat"));
        assertNotNull(function.function().signature());
        assertNull(function.serializationError());
    }

    @Test
    void typedItemsAreAbsentOnQueryErrors() {
        RunQuery.Result result = this.runQuery.run("1 +", DOCUMENT_URI);
        assertNotNull(result.error());
        assertNull(result.items());
    }

    @Test
    void serializesTypedItemsInTheResponseBody() throws Exception {
        RunQuery.Result result = this.runQuery.run("(xs:integer(\"9007199254740993\"), [])", DOCUMENT_URI);
        assertNull(result.error());
        var mapper = new com.fasterxml.jackson.databind.ObjectMapper();
        var json = mapper.readTree(mapper.writeValueAsString(result));
        assertEquals(
                "9007199254740993", json.get("items").get(0).get("lexicalValue").asText());
        assertEquals(
                "9007199254740993", json.get("items").get(0).get("serialized").asText());
        assertEquals("array", json.get("items").get(1).get("kind").asText());
        assertEquals(0, json.get("items").get(1).get("members").size());
        assertTrue(json.get("error").isNull());
        assertNull(json.get("output"));
    }

    @Test
    void missingMetadataDoesNotExposePlaceholderLocation() {
        RumbleException exception = new RumbleException("Query failed", ExceptionMetadata.EMPTY_METADATA);
        RunQuery.QueryError error = RunQuery.QueryError.from(exception);
        assertEquals("Query failed", error.message());
        assertEquals(exception.getErrorCode().toString(), error.code());
        assertNull(error.location());
        assertNull(error.range());

        exception.setMetadata(null);
        error = RunQuery.QueryError.from(exception);
        assertEquals("Query failed", error.message());
        assertEquals(exception.getErrorCode().toString(), error.code());
        assertNull(error.location());
        assertNull(error.range());
    }

    @Test
    void emptyQueryReturnsEmptyResult() {
        RunQuery.Result result = this.runQuery.run("", DOCUMENT_URI);
        assertNotNull(result.items());
        assertNull(result.error());
    }

    @Test
    void simpleArithmeticQueryExecutesSuccessfully() {
        RunQuery.Result result = assertDoesNotThrow(() -> this.runQuery.run("1 + 1", DOCUMENT_URI));
        assertNull(result.error());
        assertNotNull(result.items());
        assertEquals("2", result.items().get(0).lexicalValue());
    }

    @Test
    void jsonQueryExecutesSuccessfully() {
        RunQuery.Result result = assertDoesNotThrow(() -> this.runQuery.run("{ \"foo\": \"bar\" }", DOCUMENT_URI));
        assertNull(result.error());
        assertNotNull(result.items());
        assertEquals("foo", result.items().get(0).entries().get(0).key().lexicalValue());
        assertEquals(
                "bar", result.items().get(0).entries().get(0).value().get(0).lexicalValue());
    }

    @Test
    void handleBase64EncodedRequest() {
        String base64Body = Base64.getEncoder().encodeToString("2 * 3".getBytes(StandardCharsets.UTF_8));
        Request request = new Request(1L, "run-query", base64Body, DOCUMENT_URI.toString(), null);

        RunQuery.Result result = (RunQuery.Result) this.runQuery.handle(request);
        assertNull(result.error());
        assertNotNull(result.items());
        assertEquals("6", result.items().get(0).lexicalValue());
    }

    @Test
    void syntaxErrorReturnsStructuredError() {
        RunQuery.Result result = assertDoesNotThrow(() -> this.runQuery.run("1 +", URI.create("file:///query.jq")));
        assertNull(result.items());
        assertNotNull(result.error());
        assertEquals("XPST0003", result.error().code());
        assertTrue(!result.error().message().isBlank());
        assertEquals("file:///query.jq", result.error().location());
        assertEquals(0, result.error().range().start().line());
        assertEquals(3, result.error().range().start().character());
    }

    @Test
    void runtimeErrorReturnsStructuredError() {
        RunQuery.Result result = this.runQuery.run("1 idiv 0", URI.create("file:///runtime.jq"));
        assertNull(result.items());
        assertNotNull(result.error());
        assertEquals("FOAR0001", result.error().code());
        assertEquals("file:///runtime.jq", result.error().location());
        assertNotNull(result.error().range());
    }

    @Test
    void runFromDocumentUri() throws java.io.IOException {
        java.nio.file.Path tempFile = java.nio.file.Files.createTempFile("query", ".jq");
        java.nio.file.Files.writeString(tempFile, "10 * 10");
        try {
            // An omitted body must reach the URI-only execution path.
            Request request =
                    new Request(1L, "run-query", null, tempFile.toUri().toString(), null);
            RunQuery.Result result = (RunQuery.Result) this.runQuery.handle(request);
            assertNull(result.error());
            assertNotNull(result.items());
            assertEquals("100", result.items().get(0).lexicalValue());
        } finally {
            java.nio.file.Files.deleteIfExists(tempFile);
        }
    }

    @Test
    void resolvesSchemaImportsRelativeToTheDocumentUri(@TempDir Path directory) throws Exception {
        Files.writeString(
                directory.resolve("types.xsd"),
                "<xs:schema xmlns:xs=\"http://www.w3.org/2001/XMLSchema\" targetNamespace=\"urn:test\">"
                        + "<xs:simpleType name=\"Code\"><xs:restriction base=\"xs:string\"/></xs:simpleType>"
                        + "</xs:schema>");
        String query = "import schema namespace t = \"urn:test\" at \"types.xsd\"; t:Code(\"editor value\")";
        String body = Base64.getEncoder().encodeToString(query.getBytes(StandardCharsets.UTF_8));
        // No query file exists: execution must use the editor text and retain its URI as context.
        Request request = new Request(
                1L, "run-query", body, directory.resolve("query.jq").toUri().toString(), null);

        RunQuery.Result result = (RunQuery.Result) this.runQuery.handle(request);

        assertNull(result.error());
        assertEquals("editor value", result.items().get(0).lexicalValue());
        assertEquals("Q{urn:test}Code", result.items().get(0).typeName());
    }

    @Test
    void parallelizeQueryExecutesSuccessfully() {
        System.setProperty("spark.master", "local[*]");
        String query = "distinct-values(parallelize((1, 1.0, 1e0))) eq 1";
        RunQuery.Result result = assertDoesNotThrow(() -> this.runQuery.run(query, DOCUMENT_URI));
        assertNull(result.error());
        assertNotNull(result.items());
        assertEquals("true", result.items().get(0).lexicalValue());
    }

    @Test
    void multilineElementQueryExecutesSuccessfully() {
        String query = "xquery version \"3.1\"; <html/>, <html/>, ()";
        RunQuery.Result result = assertDoesNotThrow(() -> this.runQuery.run(query, DOCUMENT_URI));
        assertNull(result.error());
        assertNotNull(result.items());
        assertEquals(2, result.items().size());
        assertTrue(result.items().get(0).serialized().contains("<html"));
        assertEquals("node", result.items().get(1).kind());
    }
}
