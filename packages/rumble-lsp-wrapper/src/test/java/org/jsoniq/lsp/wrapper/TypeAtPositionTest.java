package org.jsoniq.lsp.wrapper;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertNull;

import java.net.URI;
import java.nio.charset.StandardCharsets;
import java.util.Base64;

import org.jsoniq.lsp.wrapper.handlers.TypeAtPosition;
import org.jsoniq.lsp.wrapper.messages.Request;
import org.junit.jupiter.api.Test;

class TypeAtPositionTest {
    private final TypeAtPosition typeAtPosition = new TypeAtPosition();

    @Test
    void returnsOuterExpressionEndingAtPosition() {
        String query = "((1 + 2) * 3)";

        TypeAtPosition.Result result = this.typeAtPosition.findType(query, new Position(0, query.length()));

        assertNotNull(result.sequenceType());
        assertEquals("xs:integer", result.sequenceType().toString());
        assertEquals(new Range(new Position(0, 0), new Position(0, query.length())), result.range());
    }

    @Test
    void returnsNestedObjectLookupType() {
        String query = """
                declare variable $a := {
                    "nested": {
                        "value": 1
                    }
                };
                $a.nested
                """;
        int expressionEnd = query.indexOf("$a.nested") + "$a.nested".length();

        TypeAtPosition.Result result = this.typeAtPosition.findType(
            query,
            positionAtOffset(query, expressionEnd)
        );

        assertNotNull(result.sequenceType());
        assertEquals("object", result.sequenceType().itemType().kind());
        assertEquals("xs:integer", result.sequenceType().itemType().fields().get("value").toString());
    }

    @Test
    void returnsSmallestExpressionContainingPositionWhenNothingEndsThere() {
        String query = "1 + 20";

        TypeAtPosition.Result result = this.typeAtPosition.findType(query, new Position(0, 5));

        assertNotNull(result.sequenceType());
        assertEquals("xs:integer", result.sequenceType().toString());
        assertEquals(new Range(new Position(0, 4), new Position(0, 6)), result.range());
    }

    @Test
    void supportsXQueryDocuments() {
        String query = "((1 + 2) * 3)";

        TypeAtPosition.Result result = this.typeAtPosition.findType(
            query,
            URI.create("file:///type-at-position.xq"),
            new Position(0, query.length())
        );

        assertNotNull(result.sequenceType());
        assertEquals("xs:integer", result.sequenceType().toString());
        assertEquals(new Range(new Position(0, 0), new Position(0, query.length())), result.range());
    }

    @Test
    void handlesDaemonRequestPayload() {
        String query = "1 + 2";
        Request request = new Request(
                1,
                TypeAtPosition.REQUEST_TYPE,
                Base64.getEncoder().encodeToString(query.getBytes(StandardCharsets.UTF_8)),
                "file:///type-at-position.jq",
                new Position(0, query.length())
        );

        TypeAtPosition.Result result = (TypeAtPosition.Result) this.typeAtPosition.handle(request);

        assertNotNull(result.sequenceType());
        assertEquals("xs:integer", result.sequenceType().toString());
    }

    @Test
    void returnsEmptyResultForInvalidQuery() {
        TypeAtPosition.Result result = this.typeAtPosition.findType("$a.", new Position(0, 3));

        assertNull(result.sequenceType());
        assertNull(result.range());
    }

    private static Position positionAtOffset(String source, int offset) {
        int line = 0;
        int character = 0;
        for (int i = 0; i < offset; i++) {
            if (source.charAt(i) == '\n') {
                line++;
                character = 0;
            } else {
                character++;
            }
        }
        return new Position(line, character);
    }
}
