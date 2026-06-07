package org.jsoniq.lsp.wrapper.handlers;

import org.jsoniq.lsp.wrapper.messages.Request;
import org.jsoniq.lsp.wrapper.messages.ResponseBody;
import org.jsoniq.lsp.wrapper.types.FunctionDefinition;
import org.rumbledb.context.BuiltinFunction;
import org.rumbledb.context.BuiltinFunctionCatalogue;
import org.rumbledb.context.FunctionIdentifier;

import java.lang.reflect.Field;
import java.util.List;
import java.util.Map;

public class BuiltinFunctions implements RequestHandler {
    public record Result(
            List<FunctionDefinition> builtinFunctions) implements ResponseBody {
    }

    public static final Result EMPTY_RESPONSE_BODY = new Result(List.of());

    public List<FunctionDefinition> listBuiltinFunctions() {
        Map<FunctionIdentifier, BuiltinFunction> functions = readCatalogue();
        return functions.values()
                .stream()
                .map(FunctionDefinition::fromBuiltinFunction)
                .toList();
    }

    @SuppressWarnings("unchecked")
    private static Map<FunctionIdentifier, BuiltinFunction> readCatalogue() {
        try {
            Field builtinsField = BuiltinFunctionCatalogue.class.getDeclaredField("builtinFunctions");
            builtinsField.setAccessible(true);
            Object value = builtinsField.get(null);
            if (!(value instanceof Map<?, ?> map)) {
                throw new IllegalStateException("Builtin function catalogue has an unexpected data type.");
            }
            return (Map<FunctionIdentifier, BuiltinFunction>) map;
        } catch (ReflectiveOperationException exception) {
            throw new IllegalStateException("Unable to read builtin function catalogue.", exception);
        }
    }

    @Override
    public ResponseBody handle(Request request) {
        return new Result(listBuiltinFunctions());
    }

    @Override
    public ResponseBody createEmptyResponse() {
        return EMPTY_RESPONSE_BODY;
    }

    @Override
    public String getRequestType() {
        return "builtinFunctions";
    }
}
