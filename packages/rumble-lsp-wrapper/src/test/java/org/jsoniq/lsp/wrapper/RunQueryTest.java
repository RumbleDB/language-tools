package org.jsoniq.lsp.wrapper;

import static org.junit.jupiter.api.Assertions.assertDoesNotThrow;
import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertTrue;

import java.nio.charset.StandardCharsets;
import java.util.Base64;

import org.jsoniq.lsp.wrapper.handlers.RunQuery;
import org.jsoniq.lsp.wrapper.messages.Request;
import org.junit.jupiter.api.Test;

class RunQueryTest {
    private final RunQuery runQuery = new RunQuery();

    @Test
    void emptyQueryReturnsEmptyResult() {
        RunQuery.Result result = this.runQuery.run("", null);
        assertNull(result.output());
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
            RunQuery.Result result = this.runQuery.run(null, tempFile.toUri());
            assertNull(result.error());
            assertNotNull(result.output());
            assertTrue(result.output().contains("100"));
        } finally {
            java.nio.file.Files.deleteIfExists(tempFile);
        }
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
