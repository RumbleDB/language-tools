package org.jsoniq.lsp.wrapper;

import org.jsoniq.lsp.wrapper.cli.BuiltInTypes;
import org.jsoniq.lsp.wrapper.types.TypeDefinition;
import org.junit.jupiter.api.Test;

import java.util.Optional;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertTrue;

class BuiltInTypesTest {

    private final BuiltInTypes builtInTypes = new BuiltInTypes();

    @Test
    void listBuiltinTypesReturnsNonEmptyResult() throws ReflectiveOperationException {
        assertFalse(this.builtInTypes.listBuiltinTypes().isEmpty());
    }

    @Test
    void listBuiltinTypesContainsStringType() throws ReflectiveOperationException {
        Optional<TypeDefinition> stringType = this.builtInTypes
                .listBuiltinTypes()
                .stream()
                .filter(definition -> "string".equals(definition.name().localName()))
                .findFirst();

        assertTrue(stringType.isPresent());
        assertEquals("xs", stringType.get().name().prefix());
        assertNotNull(stringType.get().name().namespaceUri());
    }
}
