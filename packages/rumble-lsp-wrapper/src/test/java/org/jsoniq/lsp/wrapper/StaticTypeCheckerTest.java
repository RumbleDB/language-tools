package org.jsoniq.lsp.wrapper;

import static org.junit.jupiter.api.Assertions.assertDoesNotThrow;
import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;

import org.jsoniq.lsp.wrapper.handlers.StaticTypeChecker;
import org.junit.jupiter.api.Test;

class StaticTypeCheckerTest {
    private final StaticTypeChecker typeChecker = new StaticTypeChecker();

    private StaticTypeChecker.Result checkWithoutThrow(String query) {
        return assertDoesNotThrow(() -> this.typeChecker.infer(query));
    }

    @Test
    void emptyQueryReturnsNoErrors() {
        assertTrue(checkWithoutThrow("").errors().isEmpty());
    }

    @Test
    void functionReturnTypeMismatchReturnsRawMetadataRange() {
        String query = """
                declare function local:f() as integer {
                    "$g + $c"
                };
                local:f()
                """;

        StaticTypeChecker.Result result = checkWithoutThrow(query);

        assertFalse(result.errors().isEmpty());
        StaticTypeChecker.StaticTypeError error = result.errors().get(0);
        assertEquals("XPTY0004", error.code());
        assertEquals(0, error.range().start().line());
        assertEquals(0, error.range().start().character());
    }

    @Test
    void additiveArityErrorReturnsRawMetadataRange() {
        String query = """
                declare function local:f($a, $b as integer) {
                    $a + $b
                };
                local:f((1, 2), 3)
                """;

        StaticTypeChecker.Result result = checkWithoutThrow(query);

        assertFalse(result.errors().isEmpty());
        StaticTypeChecker.StaticTypeError error = result.errors().get(0);
        assertEquals("XPTY0004", error.code());
        assertTrue(error.message().contains("arities are not allowed for additive expressions"));
        assertEquals(1, error.range().start().line());
        assertEquals(4, error.range().start().character());
    }

    @Test
    void libraryModuleIsStaticTypecheckedAsALibraryModule() {
        StaticTypeChecker.Result result = checkWithoutThrow("""
                module namespace lib = "urn:lib";
                declare function lib:f() as integer { "not an integer" };
                """);

        assertFalse(result.errors().isEmpty());
        assertEquals("XPTY0004", result.errors().get(0).code());
    }
}
