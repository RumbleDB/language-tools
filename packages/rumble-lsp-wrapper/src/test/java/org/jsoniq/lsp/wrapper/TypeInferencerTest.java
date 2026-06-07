package org.jsoniq.lsp.wrapper;

import org.junit.jupiter.api.Test;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertDoesNotThrow;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;

import org.jsoniq.lsp.wrapper.handlers.TypeInferencer;
import org.jsoniq.lsp.wrapper.handlers.TypeInferencer.VariableKind;

class TypeInferencerTest {
    private final TypeInferencer inferencer = new TypeInferencer();

    private TypeInferencer.Result inferWithoutThrow(String query) {
        return assertDoesNotThrow(() -> this.inferencer.infer(query));
    }

    @Test
    void inferEmptyQueryReturnsNoErrorAndNoTypes() {
        TypeInferencer.Result result = inferWithoutThrow("");

        assertTrue(result.types().isEmpty());
        assertTrue(result.typeErrors().isEmpty());
    }

    @Test
    void inferSimpleLetCollectsVariableType() {
        String query = "let $x := 1 return $x";

        TypeInferencer.Result result = inferWithoutThrow(query);
        assertTrue(result.typeErrors().isEmpty());

        assertTrue(variableTypes(result)
                .anyMatch(type -> VariableKind.Let.equals(type.variableKind())
                        && "x".equals(type.qname().localName())
                        && "xs:integer".equals(type.sequenceType())));
    }

    @Test
    void inferDeclareVariableCollectsDeclaredVariableType() {
        String query = """
                declare variable $a := (1, 2);
                $a
                """;

        TypeInferencer.Result result = inferWithoutThrow(query);

        assertTrue(variableTypes(result)
                .anyMatch(type -> VariableKind.Declare.equals(type.variableKind())
                        && "a".equals(type.qname().localName())
                        && type.sequenceType().contains("xs:integer")));
    }

    @Test
    void inferFunctionDeclarationCollectsFunctionTypeAndParameters() {
        String query = "declare function local:f($a as integer, $b) { $a + 1 };";

        TypeInferencer.Result result = inferWithoutThrow(query);
        assertFalse(result.types().isEmpty());
        assertTrue(result.typeErrors().isEmpty());

        TypeInferencer.FunctionType functionType = functionTypes(result)
                .filter(type -> "f".equals(type.function().name().qname().localName()))
                .findFirst()
                .orElseThrow();

        assertEquals("local", functionType.function().name().qname().lexicalPrefix());
        assertEquals("xs:integer", functionType.function().signature().parameterTypes().get(0).type().toString());
        assertEquals("item*", functionType.function().signature().parameterTypes().get(1).type().toString());
        assertEquals("item*", functionType.function().signature().returnType().toString());
    }

    @Test
    void inferInvalidQueryReturnsError() {
        assertThrows(Throwable.class, () -> this.inferencer.infer("let $x := return"));
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

        TypeInferencer.Result result = inferWithoutThrow(query);
        assertTrue(result.typeErrors().isEmpty());

        assertTrue(variableTypes(result).anyMatch(type -> "xs:integer".equals(type.sequenceType())));
        assertTrue(variableTypes(result).anyMatch(type -> "xs:string".equals(type.sequenceType())));
    }

    @Test
    void inferFunctionReturnTypeMismatchReturnsRawMetadataRange() {
        String query = """
                declare function local:f() as integer {
                    "$g + $c"
                };
                local:f()
                """;

        TypeInferencer.Result result = inferWithoutThrow(query);
        assertFalse(result.typeErrors().isEmpty());
        assertFalse(result.types().isEmpty());

        TypeInferencer.TypeError error = result.typeErrors().get(0);
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

        TypeInferencer.Result result = inferWithoutThrow(query);
        assertFalse(result.typeErrors().isEmpty());

        TypeInferencer.TypeError error = result.typeErrors().get(0);
        assertEquals("XPTY0004", error.code());
        assertTrue(error.message().contains("arities are not allowed for additive expressions"));
        assertEquals(1, error.position().line());
        assertEquals(4, error.position().character());
    }

    private static java.util.stream.Stream<TypeInferencer.VariableType> variableTypes(TypeInferencer.Result result) {
        return result.types()
                .stream()
                .filter(TypeInferencer.VariableType.class::isInstance)
                .map(TypeInferencer.VariableType.class::cast);
    }

    private static java.util.stream.Stream<TypeInferencer.FunctionType> functionTypes(TypeInferencer.Result result) {
        return result.types()
                .stream()
                .filter(TypeInferencer.FunctionType.class::isInstance)
                .map(TypeInferencer.FunctionType.class::cast);
    }

}
