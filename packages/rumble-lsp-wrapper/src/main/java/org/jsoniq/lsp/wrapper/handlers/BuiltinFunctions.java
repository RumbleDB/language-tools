package org.jsoniq.lsp.wrapper.handlers;

import org.jsoniq.lsp.wrapper.types.FunctionDefinition;
import org.rumbledb.context.BuiltinFunction;
import org.rumbledb.context.BuiltinFunctionCatalogue;
import org.rumbledb.context.FunctionIdentifier;

import java.util.List;
import java.util.Map;

public class BuiltinFunctions {
    public List<FunctionDefinition> listBuiltinFunctions() {
        Map<FunctionIdentifier, BuiltinFunction> functions = BuiltinFunctionCatalogue.getBuiltinFunctions();
        return functions.values()
                .stream()
                .map(FunctionDefinition::fromBuiltinFunction)
                .toList();
    }
}
