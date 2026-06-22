package org.jsoniq.lsp.wrapper;

import org.junit.jupiter.api.Test;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertDoesNotThrow;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;

import org.jsoniq.lsp.wrapper.handlers.StaticTypeChecker;
import org.jsoniq.lsp.wrapper.handlers.StaticTypeChecker.VariableKind;

class StaticTypeCheckerTest {
    private final StaticTypeChecker inferencer = new StaticTypeChecker();

    private StaticTypeChecker.Result inferWithoutThrow(String query) {
        return assertDoesNotThrow(() -> this.inferencer.infer(query));
    }

    @Test
    void inferEmptyQueryReturnsNoErrorAndNoTypes() {
        StaticTypeChecker.Result result = inferWithoutThrow("");

        assertTrue(result.types().isEmpty());
        assertTrue(result.errors().isEmpty());
    }

    @Test
    void inferSimpleLetCollectsVariableType() {
        String query = "let $x := 1 return $x";

        StaticTypeChecker.Result result = inferWithoutThrow(query);
        assertTrue(result.errors().isEmpty());

        assertTrue(variableTypes(result)
                .anyMatch(type -> VariableKind.Let.equals(type.variableKind())
                        && "x".equals(type.qname().localName())
                        && "xs:integer".equals(type.sequenceType().itemType().toString())));
    }

    @Test
    void inferDeclareVariableCollectsDeclaredVariableType() {
        String query = """
                declare variable $a := (1, 2);
                $a
                """;

        StaticTypeChecker.Result result = inferWithoutThrow(query);

        assertTrue(variableTypes(result)
                .anyMatch(type -> VariableKind.Declare.equals(type.variableKind())
                        && "a".equals(type.qname().localName())
                        && "xs:integer".equals(type.sequenceType().itemType().toString())));
    }

    @Test
    void inferFunctionDeclarationCollectsFunctionTypeAndParameters() {
        String query = "declare function local:f($a as integer, $b) { $a + 1 };";

        StaticTypeChecker.Result result = inferWithoutThrow(query);
        assertFalse(result.types().isEmpty());
        assertTrue(result.errors().isEmpty());

        StaticTypeChecker.FunctionType functionType = functionTypes(result)
                .filter(type -> "f".equals(type.function().name().qname().localName()))
                .findFirst()
                .orElseThrow();

        assertEquals("local", functionType.function().name().qname().prefix());
        assertEquals("xs:integer", functionType.function().signature().parameterTypes().get(0).type().toString());
        assertEquals("item*", functionType.function().signature().parameterTypes().get(1).type().toString());
        assertEquals("item*", functionType.function().signature().returnType().toString());
    }

    @Test
    void inferLetShadowingCollectsBothVariableTypes() {
        String query = """
                let $x := 1
                return (
                  let $x := "shadow"
                  return $x
                )
                """;

        StaticTypeChecker.Result result = inferWithoutThrow(query);
        assertTrue(result.errors().isEmpty());

        assertTrue(variableTypes(result).anyMatch(type -> "xs:integer".equals(type.sequenceType().itemType().toString())));
        assertTrue(variableTypes(result).anyMatch(type -> "xs:string".equals(type.sequenceType().itemType().toString())));
    }

    @Test
    void inferFunctionReturnTypeMismatchReturnsRawMetadataRange() {
        String query = """
                declare function local:f() as integer {
                    "$g + $c"
                };
                local:f()
                """;

        StaticTypeChecker.Result result = inferWithoutThrow(query);
        assertFalse(result.errors().isEmpty());
        assertFalse(result.types().isEmpty());

        StaticTypeChecker.StaticTypeError error = result.errors().get(0);
        assertEquals("XPTY0004", error.code());
        assertEquals(0, error.position().line());
        assertEquals(0, error.position().character());
    }

    @Test
    void inferAdditiveArityErrorReturnsRawMetadataRange() {
        String query = """
                declare function local:f($a, $b as integer) {
                    $a + $b
                };
                local:f((1, 2), 3)
                """;

        StaticTypeChecker.Result result = inferWithoutThrow(query);
        assertFalse(result.errors().isEmpty());

        StaticTypeChecker.StaticTypeError error = result.errors().get(0);
        assertEquals("XPTY0004", error.code());
        assertTrue(error.message().contains("arities are not allowed for additive expressions"));
        assertEquals(1, error.position().line());
        assertEquals(4, error.position().character());
    }

    private static java.util.stream.Stream<StaticTypeChecker.VariableType> variableTypes(
            StaticTypeChecker.Result result) {
        return result.types()
                .stream()
                .filter(StaticTypeChecker.VariableType.class::isInstance)
                .map(StaticTypeChecker.VariableType.class::cast);
    }

    private static java.util.stream.Stream<StaticTypeChecker.FunctionType> functionTypes(
            StaticTypeChecker.Result result) {
        return result.types()
                .stream()
                .filter(StaticTypeChecker.FunctionType.class::isInstance)
                .map(StaticTypeChecker.FunctionType.class::cast);
    }

}
