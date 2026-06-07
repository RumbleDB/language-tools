package org.jsoniq.lsp.wrapper;

import org.jsoniq.lsp.wrapper.handlers.BuiltinFunctions;
import org.jsoniq.lsp.wrapper.types.FunctionDefinition;
import org.junit.jupiter.api.Test;

import java.util.Optional;

import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertTrue;

class BuiltinFunctionsTest {

    private final BuiltinFunctions builtinFunctions = new BuiltinFunctions();

    @Test
    void listBuiltinFunctionsReturnsNonEmptyResult() {
        assertFalse(this.builtinFunctions.listBuiltinFunctions().isEmpty());
    }

    @Test
    void listBuiltinFunctionsContainsCountArityOneSignature() {
        Optional<FunctionDefinition> count = this.builtinFunctions
                .listBuiltinFunctions()
                .stream()
                .filter(definition -> "count".equals(definition.name().qname().localName()))
                .filter(definition -> Integer.valueOf(1).equals(definition.name().arity()))
                .findFirst();

        assertTrue(count.isPresent());
        assertEquals("fn", count.get().name().qname().lexicalPrefix());
        assertNotNull(count.get().name().qname().namespaceUri());
        assertEquals("xs:integer", count.get().signature().returnType());
        assertFalse(count.get().signature().parameters().isEmpty());
    }
}
