package org.jsoniq.lsp.wrapper;

import java.net.URI;
import java.util.List;

import org.jsoniq.lsp.wrapper.handlers.StaticTypeChecker;
import org.junit.jupiter.api.Test;

import static org.junit.jupiter.api.Assertions.assertDoesNotThrow;
import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;

class StaticTypeCheckerTest {
    private final StaticTypeChecker typeChecker = new StaticTypeChecker();

    private StaticTypeChecker.Result checkWithoutThrow(String query) {
        return assertDoesNotThrow(() -> this.typeChecker.infer(query, URI.create("file:///static-typecheck.jq")));
    }

    @Test
    void emptyQueryReturnsNoErrors() {
        assertTrue(checkWithoutThrow("").errors().isEmpty());
    }

    @Test
    void functionReturnTypeMismatchReturnsRawMetadataRange() {
        String query =
                """
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
        String query =
                """
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

    private static List<String> describe(StaticTypeChecker.Result result) {
        return result.errors().stream()
                .map(error -> error.code() + "@" + error.range().start().line() + ":"
                        + error.range().start().character())
                .toList();
    }

    @Test
    void reportsEveryIndependentError() {
        StaticTypeChecker.Result result = checkWithoutThrow(
                """
                declare function local:f() as integer { "x" };
                declare function local:g() as string { 1 };
                (local:f(), local:g(), 2 + "b")
                """);

        assertEquals(List.of("XPTY0004@0:0", "XPTY0004@1:0", "XPTY0004@2:23"), describe(result));
    }

    @Test
    void doesNotReportErrorsCausedByAnOperandWithAnError() {
        StaticTypeChecker.Result result = checkWithoutThrow("(1 + \"a\") * 2");

        assertEquals(List.of("XPTY0004@0:1"), describe(result));
        assertTrue(result.errors().get(0).message().contains("xs:integer + xs:string"));
    }

    @Test
    void doesNotReportErrorsCausedByAVariableBoundToAnError() {
        StaticTypeChecker.Result result = checkWithoutThrow(
                """
                let $x := 1 + "a"
                let $y := "b" - 2
                return ($x + 1, $y * 2)
                """);

        assertEquals(List.of("XPTY0004@0:10", "XPTY0004@1:10"), describe(result));
    }

    @Test
    void reportsErrorsAfterAnUndeclaredVariable() {
        StaticTypeChecker.Result result = checkWithoutThrow("($undeclared + 1, 2 + \"b\")");

        // The variable is reported once, by compilation, rather than again by each lookup of its type.
        assertEquals(List.of("XPST0008@0:1", "XPTY0004@0:18"), describe(result));
    }

    @Test
    void reportsAWrongArgumentOnceForEachCall() {
        // Compilation inlines the function and finds the first wrong argument at the argument, not at the call.
        StaticTypeChecker.Result result = checkWithoutThrow(
                """
                declare function local:f($a as integer) { $a };
                (local:f("a"), local:f("b"))
                """);

        assertEquals(List.of("XPTY0004@1:1", "XPTY0004@1:15"), describe(result));
    }

    @Test
    void libraryModuleIsStaticTypecheckedAsALibraryModule() {
        StaticTypeChecker.Result result = checkWithoutThrow(
                """
                module namespace lib = "urn:lib";
                declare function lib:f() as integer { "not an integer" };
                """);

        assertFalse(result.errors().isEmpty());
        assertEquals("XPTY0004", result.errors().get(0).code());
    }
}
