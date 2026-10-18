package org.jsoniq.lsp.wrapper.messages;

import org.jsoniq.lsp.wrapper.Position;

/** pathSteps asks type-at-position to list the path steps that the schema declares for the type's items. */
public record Request(
        long id, String requestType, String body, String documentUri, Position position, PathSteps pathSteps) {

    public Request(long id, String requestType, String body, String documentUri, Position position) {
        this(id, requestType, body, documentUri, position, null);
    }

    /**
     * The child and attribute steps that select nodes of each item, as after `/`, or with throughDescendants also of
     * each of its descendants, as after `//`.
     */
    public record PathSteps(boolean throughDescendants) {}
}
