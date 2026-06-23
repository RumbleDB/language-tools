package org.jsoniq.lsp.wrapper.messages;

import org.jsoniq.lsp.wrapper.Position;

public record Request(long id, String requestType, String body, String documentUri, Position position) {

}
