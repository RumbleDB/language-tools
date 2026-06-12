package org.jsoniq.lsp.wrapper;

import com.fasterxml.jackson.databind.ObjectMapper;

import java.io.BufferedReader;
import java.io.InputStreamReader;
import java.io.PrintWriter;
import java.nio.charset.StandardCharsets;
import java.util.Map;
import java.util.Objects;

import org.jsoniq.lsp.wrapper.handlers.BuiltinFunctions;
import org.jsoniq.lsp.wrapper.handlers.BuiltinTypes;
import org.jsoniq.lsp.wrapper.handlers.Handshake;
import org.jsoniq.lsp.wrapper.handlers.RequestHandler;
import org.jsoniq.lsp.wrapper.handlers.StaticTypeChecker;
import org.jsoniq.lsp.wrapper.messages.Request;
import org.jsoniq.lsp.wrapper.messages.Response;
import org.jsoniq.lsp.wrapper.messages.ResponseBody;

public class Main {
    private static final ObjectMapper OBJECT_MAPPER = new ObjectMapper();
    private static final StaticTypeChecker INFERENCER = new StaticTypeChecker();
    private static final BuiltinFunctions BUILTIN_FUNCTIONS = new BuiltinFunctions();
    private static final BuiltinTypes BUILTIN_TYPES = new BuiltinTypes();
    private static final Handshake HANDSHAKE = new Handshake();

    private static final Map<String, RequestHandler> DAEMON_HANDLERS = Map.of(
            INFERENCER.getRequestType(), INFERENCER,
            BUILTIN_FUNCTIONS.getRequestType(), BUILTIN_FUNCTIONS,
            BUILTIN_TYPES.getRequestType(), BUILTIN_TYPES,
            HANDSHAKE.getRequestType(), HANDSHAKE);

    public static void main(String[] args) {
        if (isDaemonMode(args)) {
            runDaemon();
            return;
        }
    }

    private static boolean isDaemonMode(String[] args) {
        for (String argument : args) {
            if ("--daemon".equals(argument)) {
                return true;
            }
        }
        return false;
    }

    private static void runDaemon() {
        try (
                BufferedReader reader = new BufferedReader(new InputStreamReader(System.in, StandardCharsets.UTF_8));
                PrintWriter writer = new PrintWriter(System.out, true, StandardCharsets.UTF_8)) {
            String line;
            while ((line = reader.readLine()) != null) {
                if (line.isBlank()) {
                    continue;
                }
                Response response = processDaemonRequest(line);
                writer.println(OBJECT_MAPPER.writeValueAsString(response));
                writer.flush();
            }
            System.exit(0);
        } catch (Throwable throwable) {
            throwable.printStackTrace(System.err);
            System.err.flush();
            System.exit(1);
        }
    }

    private static Response processDaemonRequest(String requestLine) {
        long requestId = -1L;
        String requestType = null;

        try {
            Request request = OBJECT_MAPPER.readValue(requestLine, Request.class);
            requestId = request.id();
            requestType = request.requestType();
            RequestHandler handler = DAEMON_HANDLERS.get(requestType);
            if (handler == null) {
                return new Response(requestId, requestType, null,
                        new Error("UNSUPPORTED_REQUEST_TYPE", "Unsupported requestType '" + requestType + "'.", null));
            }

            return new Response(requestId, requestType,
                    handler.handle(new Request(requestId, requestType, request.body(), request.documentUri())), null);
        } catch (Throwable throwable) {
            throwable.printStackTrace(System.err);
            System.err.flush();
            String errorMessage = Objects.toString(throwable.getMessage(), throwable.getClass().getName());
            RequestHandler handler = DAEMON_HANDLERS.get(requestType);
            ResponseBody emptyResponse = handler == null ? null : handler.createEmptyResponse();
            return new Response(requestId, requestType, emptyResponse,
                    new Error("Internal error occurred.", errorMessage, null));
        }
    }
}
