package org.jsoniq.lsp.wrapper;

import java.net.URI;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.Base64;
import java.util.HashSet;
import java.util.List;
import java.util.Set;

import org.jsoniq.lsp.wrapper.handlers.QueryResultItem;
import org.jsoniq.lsp.wrapper.handlers.RunQuery;
import org.jsoniq.lsp.wrapper.messages.Request;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;

import static org.junit.jupiter.api.Assertions.assertDoesNotThrow;
import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertInstanceOf;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertTrue;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;

import org.rumbledb.exceptions.ExceptionMetadata;
import org.rumbledb.exceptions.RumbleException;

class RunQueryTest {
    private static final URI DOCUMENT_URI = URI.create("file:///run-query");

    private final RunQuery runQuery = new RunQuery();
    private final ObjectMapper mapper = new ObjectMapper();

    @Test
    void preservesMixedJsoniqItemsAndNestedTypes() throws Exception {
        RunQuery.Result result = this.runQuery.run("(42, \"42\", true, null, {\"n\": 7}, [1, [2]])", DOCUMENT_URI);
        assertNull(result.error());
        assertEquals(
                java.util.List.of("atomic", "atomic", "atomic", "null", "object", "array"),
                result.items().stream().map(item -> item.kind()).toList());
        assertEquals("42", result.items().get(0).serialized());
        assertEquals("\"42\"", result.items().get(1).serialized());
        assertTrue(!result.items()
                .get(0)
                .type()
                .displayName()
                .equals(result.items().get(1).type().displayName()));
        assertInstanceOf(QueryResultItem.AtomicItem.class, result.items().get(0));
        assertInstanceOf(QueryResultItem.NullItem.class, result.items().get(3));
        for (var item : result.items().subList(0, 4)) assertItemProperties(json(item));
        var object = assertInstanceOf(
                QueryResultItem.ObjectItem.class, result.items().get(4));
        assertEquals("n", object.fields().get(0).name());
        assertEquals("7", object.fields().get(0).value().get(0).serialized());
        assertItemProperties(json(object), "fields");
        var array =
                assertInstanceOf(QueryResultItem.ArrayItem.class, result.items().get(5));
        var nested = assertInstanceOf(
                QueryResultItem.ArrayItem.class, array.members().get(1).get(0));
        assertEquals("2", nested.members().get(0).get(0).serialized());
    }

    @Test
    void distinguishesEmptySequenceNullEmptyStringAndEmptyContainers() throws Exception {
        RunQuery.Result empty = this.runQuery.run("()", DOCUMENT_URI);
        assertNull(empty.error());
        assertEquals(java.util.List.of(), empty.items());
        JsonNode emptyJson = json(empty);
        assertProperties(emptyJson, "items", "error");
        assertEquals(0, emptyJson.get("items").size());
        assertTrue(emptyJson.get("error").isNull());
        RunQuery.Result result = this.runQuery.run("(null, \"\", [], {})", DOCUMENT_URI);
        assertNull(result.error());
        assertEquals(4, result.items().size());
        assertEquals("null", result.items().get(0).kind());
        assertEquals("\"\"", result.items().get(1).serialized());
        assertEquals(
                java.util.List.of(),
                assertInstanceOf(QueryResultItem.ArrayItem.class, result.items().get(2))
                        .members());
        assertEquals(
                java.util.List.of(),
                assertInstanceOf(
                                QueryResultItem.ObjectItem.class, result.items().get(3))
                        .fields());
        assertEquals(0, json(result.items().get(2)).get("members").size());
        assertEquals(0, json(result.items().get(3)).get("fields").size());
    }

    @Test
    void preservesNumericPrecisionAndAtomicTypeNames() throws Exception {
        RunQuery.Result result = this.runQuery.run(
                "(xs:integer(\"123456789012345678901234567890\"), xs:decimal(\"0.12345678901234567890123456789\"), xs:date(\"2026-10-02\"))",
                DOCUMENT_URI);
        assertNull(result.error());
        assertEquals("123456789012345678901234567890", result.items().get(0).serialized());
        assertEquals("0.12345678901234567890123456789", result.items().get(1).serialized());
        assertEquals(
                "Q{http://www.w3.org/2001/XMLSchema}date",
                result.items().get(2).type().qname());
        assertEquals("xs:date(\"2026-10-02\")", result.items().get(2).serialized());
        JsonNode response = json(result);
        assertProperties(response, "items", "error");
        assertEquals(
                "123456789012345678901234567890",
                response.get("items").get(0).get("serialized").asText());
        JsonNode dateType = response.get("items").get(2).get("type");
        assertProperties(dateType, "kind", "name", "displayName", "qname");
        assertEquals("named", dateType.get("kind").asText());
        assertEquals("date", dateType.get("name").get("localName").asText());
        assertEquals(
                result.items().get(2).type().displayName(),
                dateType.get("displayName").asText());
        assertEquals(
                "Q{http://www.w3.org/2001/XMLSchema}date", dateType.get("qname").asText());
        assertTrue(response.get("error").isNull());
    }

    @Test
    void distinguishesXmlNodesFromStringsContainingXml() throws Exception {
        RunQuery.Result result = this.runQuery.run("xquery version \"3.1\"; (<book/>, \"<book/>\")", DOCUMENT_URI);
        assertNull(result.error());
        assertEquals("node", result.items().get(0).kind());
        assertEquals(
                "element",
                assertInstanceOf(QueryResultItem.NodeItem.class, result.items().get(0))
                        .nodeKind());
        assertTrue(result.items().get(0).serialized().contains("book"));
        assertEquals("atomic", result.items().get(1).kind());
        assertEquals("\"<book/>\"", result.items().get(1).serialized());
        assertItemProperties(json(result.items().get(0)), "nodeKind");
        assertItemProperties(json(result.items().get(1)));
    }

    @Test
    void preservesTypedMapKeysAndSequenceValuedEntriesAndArrayMembers() throws Exception {
        RunQuery.Result result = this.runQuery.run(
                "xquery version \"3.1\"; (map {1: (\"a\", \"b\"), \"1\": ()}, [(), (1, 2), [3]])", DOCUMENT_URI);
        assertNull(result.error());
        var map = assertInstanceOf(QueryResultItem.MapItem.class, result.items().get(0));
        assertEquals("map", map.kind());
        assertEquals(2, map.entries().size());
        var numericEntry = map.entries().stream()
                .filter(entry -> entry.key().type().qname().endsWith("}int")
                        || entry.key().type().qname().endsWith("}integer"))
                .findFirst()
                .orElseThrow();
        assertEquals(2, numericEntry.value().size());
        assertEquals("1", numericEntry.key().serialized());
        assertProperties(json(numericEntry), "key", "value");
        var stringEntry = map.entries().stream()
                .filter(entry -> entry.key().type().qname().endsWith("}string"))
                .findFirst()
                .orElseThrow();
        assertEquals(java.util.List.of(), stringEntry.value());
        assertEquals("\"1\"", stringEntry.key().serialized());
        assertProperties(json(stringEntry), "key", "value");
        assertNotNull(map.serialized());
        assertItemProperties(json(map), "entries");
        var array =
                assertInstanceOf(QueryResultItem.ArrayItem.class, result.items().get(1));
        assertEquals(java.util.List.of(), array.members().get(0));
        assertEquals(2, array.members().get(1).size());
        assertEquals("array", array.members().get(2).get(0).kind());
        JsonNode arrayJson = json(array);
        assertItemProperties(arrayJson, "members");
        assertEquals(0, arrayJson.get("members").get(0).size());
        assertEquals(2, arrayJson.get("members").get(1).size());
        assertEquals("array", arrayJson.get("members").get(2).get(0).get("kind").asText());
    }

    @Test
    void returningAFunctionDoesNotFailSerialization() throws Exception {
        RunQuery.Result result = this.runQuery.run("xquery version \"3.1\"; fn:concat#2", DOCUMENT_URI);
        assertNull(result.error());
        var function = assertInstanceOf(
                QueryResultItem.FunctionItem.class, result.items().get(0));
        assertEquals("function", function.kind());
        assertEquals(2, function.arity());
        assertTrue(function.name().contains("concat"));
        assertNotNull(function.signature());
        assertNotNull(function.serialized());
        assertEquals("opaque", function.type().kind());
        assertNull(function.type().name());
        assertEquals(function.type().displayName(), function.type().toString());
        assertItemProperties(json(function), "name", "arity", "signature");
    }

    @Test
    void serializationFailureReturnsQueryErrorWithoutPartialResults() {
        String invalidCharacter = String.valueOf((char) 0xFFFF);
        String query = "xquery version \"3.1\"; (42, text { \"" + invalidCharacter + "\" }, 7)";

        RunQuery.Result result = this.runQuery.run(query, DOCUMENT_URI);

        assertNull(result.items());
        assertNotNull(result.error());
        assertEquals("FOCH0001", result.error().code());
        assertTrue(result.error().message().contains("result serialization failed for item 2"));
        assertTrue(result.error().message().contains("Character #65535 is not representable in XML 1.0"));
        assertNull(result.error().location());
        assertNull(result.error().range());
    }

    @Test
    void nestedSerializationFailureReturnsQueryError() {
        String invalidCharacter = String.valueOf((char) 0xFFFF);
        String query = "xquery version \"3.1\"; [text { \"" + invalidCharacter + "\" }]";

        RunQuery.Result result = this.runQuery.run(query, DOCUMENT_URI);

        assertNull(result.items());
        assertNotNull(result.error());
        assertEquals("FOCH0001", result.error().code());
        assertTrue(result.error().message().contains("result serialization failed for item 1"));
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
    void jsonDocDuplicateKeyErrorUsesResourceUriAndKeyRange(@TempDir Path directory) throws Exception {
        var file = directory.resolve("duplicates.json");
        Files.writeString(file, "{\r\n  \"a\":1,\r\n  \"\\u0061\":2\r\n}");
        RunQuery.Result result = this.runQuery.run(
                "json-doc('duplicates.json', {\"duplicates\":\"reject\"})",
                directory.resolve("query.jq").toUri());
        assertNull(result.items());
        assertEquals("FOJS0003", result.error().code());
        assertEquals(
                directory.toUri().resolve("duplicates.json").toString(),
                result.error().location());
        assertEquals(
                new Range(new Position(2, 2), new Position(2, 10)),
                result.error().range());
        assertProperties(json(result).path("error"), "message", "code", "location", "range");
    }

    @Test
    void jsonDocEofUsesResolvedResourceUriAndEmptyRange(@TempDir Path directory) throws Exception {
        var file = directory.resolve("incomplete.json");
        Files.writeString(file, "[\r\n");
        RunQuery.Result result = this.runQuery.run(
                "json-doc('incomplete.json')", directory.resolve("query.jq").toUri());
        assertNull(result.items());
        assertEquals("FOJS0001", result.error().code());
        assertEquals(
                directory.toUri().resolve("incomplete.json").toString(),
                result.error().location());
        assertEquals(
                new Range(new Position(1, 0), new Position(1, 0)),
                result.error().range());
        assertProperties(json(result).path("error"), "message", "code", "location", "range");
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
        assertEquals("2", result.items().get(0).serialized());
    }

    @Test
    void jsonQueryExecutesSuccessfully() {
        RunQuery.Result result = assertDoesNotThrow(() -> this.runQuery.run("{ \"foo\": \"bar\" }", DOCUMENT_URI));
        assertNull(result.error());
        assertNotNull(result.items());
        assertEquals(
                "foo",
                assertInstanceOf(
                                QueryResultItem.ObjectItem.class, result.items().get(0))
                        .fields()
                        .get(0)
                        .name());
        assertEquals(
                "\"bar\"",
                assertInstanceOf(
                                QueryResultItem.ObjectItem.class, result.items().get(0))
                        .fields()
                        .get(0)
                        .value()
                        .get(0)
                        .serialized());
    }

    @Test
    void handleBase64EncodedRequest() {
        String base64Body = Base64.getEncoder().encodeToString("2 * 3".getBytes(StandardCharsets.UTF_8));
        Request request = new Request(1L, "run-query", base64Body, DOCUMENT_URI.toString(), null);

        RunQuery.Result result = (RunQuery.Result) this.runQuery.handle(request);
        assertNull(result.error());
        assertNotNull(result.items());
        assertEquals("6", result.items().get(0).serialized());
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
    void runtimeErrorReturnsStructuredError() throws Exception {
        RunQuery.Result result = this.runQuery.run("1 idiv 0", URI.create("file:///runtime.jq"));
        assertNull(result.items());
        assertNotNull(result.error());
        assertEquals("FOAR0001", result.error().code());
        assertEquals("file:///runtime.jq", result.error().location());
        assertNotNull(result.error().range());
        JsonNode response = json(result);
        assertProperties(response, "items", "error");
        assertTrue(response.get("items").isNull());
        assertEquals("FOAR0001", response.get("error").get("code").asText());
        var fallback = this.runQuery.createEmptyResponse();
        assertNull(fallback.items());
        assertNotNull(fallback.error());
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
            assertEquals("100", result.items().get(0).serialized());
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
        assertEquals("\"editor value\"", result.items().get(0).serialized());
        assertEquals("Q{urn:test}Code", result.items().get(0).type().qname());
    }

    @Test
    void parallelizeQueryExecutesSuccessfully() {
        System.setProperty("spark.master", "local[*]");
        String query = "distinct-values(parallelize((1, 1.0, 1e0))) eq 1";
        RunQuery.Result result = assertDoesNotThrow(() -> this.runQuery.run(query, DOCUMENT_URI));
        assertNull(result.error());
        assertNotNull(result.items());
        assertEquals("true()", result.items().get(0).serialized());
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

    @Test
    void objectFieldsPreserveLiteralNamesWithoutDuplicatingKeyItems() throws Exception {
        var names = List.of("", "a.b", "__proto__", "say \"hello\"", "line\nfeed", "😀");
        var fields = new java.util.ArrayList<String>();
        for (String name : names) {
            fields.add(this.mapper.writeValueAsString(name) + ": 1");
        }
        var result = this.runQuery.run("{" + String.join(",", fields) + "}", DOCUMENT_URI);
        assertNull(result.error());
        var object = assertInstanceOf(
                QueryResultItem.ObjectItem.class, result.items().get(0));
        assertEquals(
                names,
                object.fields().stream().map(QueryResultItem.ObjectField::name).toList());
        JsonNode objectJson = json(object);
        assertItemProperties(objectJson, "fields");
        for (int index = 0; index < names.size(); index++) {
            JsonNode field = objectJson.get("fields").get(index);
            assertProperties(field, "name", "value");
            assertEquals(names.get(index), field.get("name").asText());
            assertEquals("1", field.get("value").get(0).get("serialized").asText());
        }
    }

    private JsonNode json(Object value) throws Exception {
        return this.mapper.readTree(this.mapper.writeValueAsString(value));
    }

    private static void assertItemProperties(JsonNode item, String... properties) {
        var expected = new HashSet<>(Set.of("kind", "type", "serialized"));
        expected.addAll(List.of(properties));
        assertProperties(item, expected.toArray(String[]::new));
        JsonNode type = item.get("type");
        var expectedType = new HashSet<>(Set.of("kind", "displayName"));
        if (type.has("name")) expectedType.addAll(Set.of("name", "qname"));
        switch (type.get("kind").asText()) {
            case "object" -> expectedType.add("fields");
            case "union" -> expectedType.add("members");
            case "array" -> {
                if (type.has("content")) expectedType.add("content");
            }
        }
        assertProperties(type, expectedType.toArray(String[]::new));
        assertTrue(type.get("displayName").isTextual());
    }

    private static void assertProperties(JsonNode node, String... properties) {
        var actual = new HashSet<String>();
        node.fieldNames().forEachRemaining(actual::add);
        assertEquals(Set.of(properties), actual);
    }
}
