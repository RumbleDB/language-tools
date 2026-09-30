package org.jsoniq.lsp.wrapper.messages;

import org.jsoniq.lsp.wrapper.Error;

public record Response(long id, String responseType, ResponseBody body, Error error) {}
