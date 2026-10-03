package org.jsoniq.lsp.wrapper;

import java.nio.charset.StandardCharsets;
import java.util.Base64;

import org.jsoniq.lsp.wrapper.handlers.RunQuery;
import org.jsoniq.lsp.wrapper.handlers.StaticTypeChecker;
import org.jsoniq.lsp.wrapper.handlers.TypeAtPosition;
import org.jsoniq.lsp.wrapper.messages.Request;
import org.junit.jupiter.api.Test;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;

class QueryDocumentUriTest {
    private Request requestWithoutUri(String requestType) {
        return new Request(
                1,
                requestType,
                Base64.getEncoder().encodeToString("1".getBytes(StandardCharsets.UTF_8)),
                null,
                new Position(0, 1));
    }

    @Test
    void staticTypecheckRequiresUriForDirectAndDaemonCalls() {
        StaticTypeChecker checker = new StaticTypeChecker();
        assertThrows(NullPointerException.class, () -> checker.infer("1", null));
        assertThrows(NullPointerException.class, () -> checker.handle(requestWithoutUri(checker.getRequestType())));
    }

    @Test
    void typeHoverRequiresUriForDirectAndDaemonCalls() {
        TypeAtPosition hover = new TypeAtPosition();
        assertThrows(NullPointerException.class, () -> hover.findType("1", null, new Position(0, 1)));
        assertThrows(NullPointerException.class, () -> hover.handle(requestWithoutUri(hover.getRequestType())));
    }

    @Test
    void executionRequiresUriForDirectAndDaemonCalls() {
        RunQuery run = new RunQuery();
        assertThrows(NullPointerException.class, () -> run.run("1", null));
        assertThrows(NullPointerException.class, () -> run.handle(requestWithoutUri(run.getRequestType())));
    }

    private Request untitledRequest(String requestType, String query) {
        return new Request(
                1,
                requestType,
                Base64.getEncoder().encodeToString(query.getBytes(StandardCharsets.UTF_8)),
                "untitled:Untitled-1",
                new Position(0, query.length()));
    }

    @Test
    void executesUntitledJsoniqAndXQueryDocuments() {
        RunQuery run = new RunQuery();
        for (String query : new String[] {"1 + 2", "xquery version \"3.1\"; 1 + 2"}) {
            RunQuery.Result result = (RunQuery.Result) run.handle(untitledRequest(run.getRequestType(), query));
            assertNull(result.error());
            assertEquals("3", result.items().get(0).serialized());
        }
    }

    @Test
    void reportsSyntaxErrorsAgainstUntitledDocumentUri() {
        RunQuery run = new RunQuery();
        RunQuery.Result result = (RunQuery.Result) run.handle(untitledRequest(run.getRequestType(), "1 +"));
        assertEquals("XPST0003", result.error().code());
        assertEquals("untitled:Untitled-1", result.error().location());
        assertEquals(new Position(0, 3), result.error().range().start());
    }

    @Test
    void typechecksUntitledDocumentsAndPreservesErrorLocation() {
        StaticTypeChecker checker = new StaticTypeChecker();
        StaticTypeChecker.Result valid =
                (StaticTypeChecker.Result) checker.handle(untitledRequest(checker.getRequestType(), "1 + 2"));
        assertTrue(valid.errors().isEmpty());
        String query = "declare function local:f() as integer { \"wrong\" }; local:f()";
        StaticTypeChecker.Result invalid =
                (StaticTypeChecker.Result) checker.handle(untitledRequest(checker.getRequestType(), query));
        assertEquals("XPTY0004", invalid.errors().get(0).code());
        assertEquals("untitled:Untitled-1", invalid.errors().get(0).location());
    }

    @Test
    void returnsHoverTypeAndRangeForUntitledDocuments() {
        TypeAtPosition hover = new TypeAtPosition();
        TypeAtPosition.Result result = hover.handle(untitledRequest(hover.getRequestType(), "1 + 2"));
        assertEquals("xs:integer", result.sequenceType().toString());
        assertEquals(new Range(new Position(0, 0), new Position(0, 5)), result.range());
    }
}
