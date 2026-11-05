package org.jsoniq.lsp.wrapper;

import java.net.URI;
import java.util.stream.Stream;

import org.jsoniq.lsp.wrapper.handlers.TypeAtPosition;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.Arguments;
import org.junit.jupiter.params.provider.MethodSource;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNull;

/** Queries that RumbleDB rejects, with `|` at the position whose type is requested. */
class TolerantTypeAtPositionTest {
    private static final URI JSONIQ_URI = URI.create("file:///tolerant.jq");
    private static final URI XQUERY_URI = URI.create("file:///tolerant.xq");
    private static final String OBJECT = "{ a: xs:integer }";

    private final TypeAtPosition typeAtPosition = new TypeAtPosition();

    private static Stream<Arguments> jsoniqQueries() {
        return Stream.of(
                Arguments.of("let $x| := {\"a\": 1}", OBJECT),
                Arguments.of("let $x := {\"a\": 1} let $y| := $x.a", "xs:integer"),
                Arguments.of("let $x| := {\"a\": 1} let $y :=", OBJECT),
                Arguments.of("let $x| := {\"a\": 1} return $x.", OBJECT),
                Arguments.of("let $x| := {\"a\": 1} return ($x.a", OBJECT),
                Arguments.of("let $x| := {\"a\": 1} return ($x.a, )", OBJECT),
                Arguments.of("let $x| := {\"a\": 1} retur $x", OBJECT),
                Arguments.of("let $x := {\"a\": 1}\nlet $y| := $x\n", OBJECT),
                Arguments.of("let $x| := {\"a\": 1} return $x.a + $nope", OBJECT),
                Arguments.of("let $x| := {\"a\": 1} return nope($x)", OBJECT),
                Arguments.of("let $x| := {\"a\": 1} return abs($x, 1, 2)", OBJECT),
                Arguments.of("let $x| := {\"a\": 1} return p:f($x)", OBJECT),
                Arguments.of("let $x| := {\"a\": 1} return $x instance of nope", OBJECT),
                Arguments.of("declare function local:f($a, $a) { 1 }; let $x| := {\"a\": 1} return $x", OBJECT),
                Arguments.of("declare variable $x| := {\"a\": 1}; $x.", OBJECT),
                Arguments.of("declare variable $x| := {\"a\": 1}; declare function local:f() { $x. }; 1", OBJECT),
                Arguments.of("declare variable $x| := {\"a\": 1}; declare function local:f() { $nope }; 1", OBJECT),
                Arguments.of("declare variable $b := ; let $x| := {\"a\": 1} return $x", OBJECT),
                Arguments.of("import module namespace m = \"urn:nope\"; let $x| := {\"a\": 1} return $x", OBJECT),
                Arguments.of("declare function local:f() { let $x| := {\"a\": 1} }; 1", OBJECT));
    }

    @ParameterizedTest
    @MethodSource("jsoniqQueries")
    void findsTypesInBrokenJsoniq(String markedQuery, String expected) {
        assertEquals(expected, typeAt(markedQuery, JSONIQ_URI));
    }

    @ParameterizedTest
    @MethodSource("xqueryQueries")
    void findsTypesInBrokenXQuery(String markedQuery, String expected) {
        assertEquals(expected, typeAt(markedQuery, XQUERY_URI));
    }

    private static Stream<Arguments> xqueryQueries() {
        return Stream.of(
                Arguments.of("let $x| := 1", "xs:integer"),
                Arguments.of("let $x| := 1 let $y :=", "xs:integer"),
                Arguments.of("let $x| := 1 return ($x", "xs:integer"),
                Arguments.of("let $x| := 1 return ($x, )", "xs:integer"),
                Arguments.of("let $x| := 1 return nope($x)", "xs:integer"),
                Arguments.of("declare variable $b := ; let $x| := 1 return $x", "xs:integer"));
    }

    @Test
    void findsTypesInLibraryModule() {
        assertEquals(
                OBJECT, typeAt("module namespace m = \"urn:m\"; declare variable $m:x| := {\"a\": 1};", JSONIQ_URI));
    }

    @Test
    void keepsPositionsAfterBlankedDeclaration() {
        assertEquals(OBJECT, typeAt("declare variable $b := ;\ndeclare variable $x| := {\"a\": 1};\n$x", JSONIQ_URI));
    }

    @Test
    void reportsNothingForWhatFailedToCompile() {
        assertNull(typeAt("let $x := {\"a\": 1} return nope|($x)", JSONIQ_URI));
    }

    @Test
    void reportsNothingForBindingsOfWhatFailedToCompile() {
        assertNull(typeAt("let $x := {\"a\": 1} let $y| := nope($x) return $y", JSONIQ_URI));
    }

    @Test
    void reportsNothingForBindingsOfLookupsAndStepsBeingTyped() {
        assertNull(typeAt("let $x := {\"a\": 1} let $y| := $x.", JSONIQ_URI));
        assertNull(typeAt("let $x := <a/> let $y| := $x/", XQUERY_URI));
        assertNull(typeAt("let $x := <a/> let $y| := $x/", JSONIQ_URI));
    }

    @Test
    void stillReportsDeclaredItemTypes() {
        assertEquals("item*", typeAt("declare variable $e| external; $e.", JSONIQ_URI));
    }

    @Test
    void doesNotChangeTypesOfValidQueries() {
        assertEquals(OBJECT, typeAt("let $x| := {\"a\": 1} return $x", JSONIQ_URI));
    }

    private String typeAt(String markedQuery, URI uri) {
        int marker = markedQuery.indexOf('|');
        String before = markedQuery.substring(0, marker);
        int line = (int) before.chars().filter(character -> character == '\n').count();
        int character = marker - (before.lastIndexOf('\n') + 1);
        var type = this.typeAtPosition
                .findType(markedQuery.replace("|", ""), uri, new Position(line, character))
                .sequenceType();
        return type == null ? null : type.toString();
    }
}
