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
        RunQuery.Result result = this.runQuery.run("");
        assertNull(result.output());
        assertNull(result.error());
    }

    @Test
    void simpleArithmeticQueryExecutesSuccessfully() {
        RunQuery.Result result = assertDoesNotThrow(() -> this.runQuery.run("1 + 1"));
        assertNull(result.error());
        assertNotNull(result.output());
        assertEquals("2", result.output().trim());
    }

    @Test
    void jsonQueryExecutesSuccessfully() {
        RunQuery.Result result = assertDoesNotThrow(() -> this.runQuery.run("{ \"foo\": \"bar\" }"));
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
        assertEquals("6", result.output().trim());
    }

    @Test
    void syntaxErrorReturnsErrorMessage() {
        RunQuery.Result result = assertDoesNotThrow(() -> this.runQuery.run("1 +"));
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
            assertEquals("100", result.output().trim());
        } finally {
            java.nio.file.Files.deleteIfExists(tempFile);
        }
    }
}
