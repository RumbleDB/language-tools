package org.jsoniq.lsp.wrapper.messages;

import org.jsoniq.lsp.wrapper.Position;

import com.fasterxml.jackson.annotation.JsonProperty;

/** pathSteps asks type-at-position to list the path steps that the schema declares for the type's items. */
public record Request(
        long id, String requestType, String body, String documentUri, Position position, PathSteps pathSteps) {

    public Request(long id, String requestType, String body, String documentUri, Position position) {
        this(id, requestType, body, documentUri, position, null);
    }

    public enum PathSteps {
        /** The steps that select children or attributes of each item, as after `/`. */
        @JsonProperty("children")
        CHILDREN,
        /** The steps that select children or attributes of each item or of its descendants, as after `//`. */
        @JsonProperty("descendants")
        DESCENDANTS
    }
}
