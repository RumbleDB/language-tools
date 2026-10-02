package org.jsoniq.lsp.wrapper;

import java.nio.charset.StandardCharsets;
import java.util.Base64;

import org.jsoniq.lsp.wrapper.handlers.RunQuery;
import org.jsoniq.lsp.wrapper.handlers.StaticTypeChecker;
import org.jsoniq.lsp.wrapper.handlers.TypeAtPosition;
import org.jsoniq.lsp.wrapper.messages.Request;
import org.junit.jupiter.api.Test;

import static org.junit.jupiter.api.Assertions.assertThrows;

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
}
