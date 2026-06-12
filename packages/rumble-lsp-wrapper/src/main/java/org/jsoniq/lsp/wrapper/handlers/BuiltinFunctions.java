package org.jsoniq.lsp.wrapper.handlers;

import org.jsoniq.lsp.wrapper.types.FunctionDefinition;
import org.rumbledb.context.BuiltinFunction;
import org.rumbledb.context.BuiltinFunctionCatalogue;
import org.rumbledb.context.FunctionIdentifier;

import java.lang.reflect.Field;
import java.util.List;
import java.util.Map;

public class BuiltinFunctions {
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
}
