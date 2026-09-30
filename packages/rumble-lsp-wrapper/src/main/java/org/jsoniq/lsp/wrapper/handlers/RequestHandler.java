package org.jsoniq.lsp.wrapper.handlers;

import org.jsoniq.lsp.wrapper.messages.Request;
import org.jsoniq.lsp.wrapper.messages.ResponseBody;

public interface RequestHandler {
    String getRequestType();

    ResponseBody handle(Request request);

    ResponseBody createEmptyResponse();
}
