package org.jsoniq.lsp.wrapper;

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

class RunQueryTest {
    private final RunQuery runQuery = new RunQuery();

    @Test
    void emptyQueryReturnsEmptyResult() {
        RunQuery.Result result = this.runQuery.run("", null);
        assertNotNull(result.output());
        assertNull(result.error());
    }

    @Test
    void simpleArithmeticQueryExecutesSuccessfully() {
        RunQuery.Result result = assertDoesNotThrow(() -> this.runQuery.run("1 + 1", null));
        assertNull(result.error());
        assertNotNull(result.output());
        assertTrue(result.output().contains("2"));
    }

    @Test
    void jsonQueryExecutesSuccessfully() {
        RunQuery.Result result = assertDoesNotThrow(() -> this.runQuery.run("{ \"foo\": \"bar\" }", null));
        assertNull(result.error());
        assertNotNull(result.output());
        assertTrue(result.output().contains("foo"));
        assertTrue(result.output().contains("bar"));
    }

    @Test
    void handleBase64EncodedRequest() {
        String base64Body = Base64.getEncoder().encodeToString("2 * 3".getBytes(StandardCharsets.UTF_8));
        Request request = new Request(1L, "run-query", base64Body, null, null);

        RunQuery.Result result = (RunQuery.Result) this.runQuery.handle(request);
        assertNull(result.error());
        assertNotNull(result.output());
        assertTrue(result.output().contains("6"));
    }

    @Test
    void syntaxErrorReturnsErrorMessage() {
        RunQuery.Result result = assertDoesNotThrow(() -> this.runQuery.run("1 +", null));
        assertNull(result.output());
        assertNotNull(result.error());
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
            assertNotNull(result.output());
            assertTrue(result.output().contains("100"));
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
        assertEquals("[\"editor value\"]", result.output());
    }

    @Test
    void parallelizeQueryExecutesSuccessfully() {
        System.setProperty("spark.master", "local[*]");
        String query = "distinct-values(parallelize((1, 1.0, 1e0))) eq 1";
        RunQuery.Result result = assertDoesNotThrow(() -> this.runQuery.run(query, null));
        assertNull(result.error());
        assertNotNull(result.output());
        assertTrue(result.output().contains("true"));
    }

    @Test
    void multilineElementQueryExecutesSuccessfully() {
        String query = "xquery version \"3.1\"; <html/>, <html/>, ()";
        RunQuery.Result result = assertDoesNotThrow(() -> this.runQuery.run(query, null));
        assertNull(result.error());
        assertNotNull(result.output());
        assertTrue(result.output().contains("<html>"));
        assertTrue(result.output().contains("</html>"));
    }
}
