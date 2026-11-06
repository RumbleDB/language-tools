package org.jsoniq.lsp.wrapper;

import java.io.IOException;
import java.net.URI;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.stream.Stream;

import org.jsoniq.lsp.wrapper.handlers.TypeAtPosition;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;
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
    private static final String LIBRARY =
            "module namespace l = \"urn:l\";\ndeclare variable $l:v as xs:integer := 1;\n";
    private static final String LIBRARY_IMPORT = "import module namespace l = \"urn:l\" at \"lib.jq\";\n";

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
                Arguments.of("declare variable ; let $x| := {\"a\": 1} return $x", OBJECT),
                Arguments.of(
                        "declare variable $a := $b; declare variable $b := {\"a\": 1}; let $y| := $a return $nope",
                        OBJECT),
                Arguments.of("let $f| := abs(?) return $nope", "function(xs:numeric?) as xs:numeric?"),
                Arguments.of("declare function local:f() { let $x| := {\"a\": 1} }; 1", OBJECT),
                Arguments.of("let $x := {\"a\": 1} let $y := $x!$|$", OBJECT),
                Arguments.of("let $x := {\"a\": 1} return ($x!$|$", OBJECT),
                Arguments.of("let $x := {\"a\": 1} let $y := $x!$|$ let $z := return 1", OBJECT),
                Arguments.of("let $x := {\"a\": 1} return abs($x!$|$", OBJECT),
                Arguments.of("for $i in $nope let $y| := {\"a\": 1} return $y", OBJECT),
                Arguments.of("for $i in nope() let $y| := {\"a\": 1} return $y", OBJECT),
                Arguments.of("for $i in abs(1, 2) let $y| := {\"a\": 1} return $y", OBJECT),
                Arguments.of("for $z as nope in 1 let $y| := {\"a\": 1} return $y", OBJECT),
                Arguments.of(
                        "declare variable $d := 1; declare variable $d := 2; let $x| := {\"a\": 1} return $x", OBJECT));
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
                Arguments.of("let $x := 1\r\nlet $y| := $x\r\nreturn nope()", "xs:integer"),
                Arguments.of("declare variable $b := ; let $x| := 1 return $x", "xs:integer"),
                Arguments.of("for $i in $nope let $y| := 1 return $y", "xs:integer"));
    }

    @Test
    void findsTypesInLibraryModule() {
        assertEquals(
                OBJECT, typeAt("module namespace m = \"urn:m\"; declare variable $m:x| := {\"a\": 1};", JSONIQ_URI));
    }

    @Test
    void findsTypesAfterImportOfBrokenLibrary(@TempDir Path directory) throws IOException {
        Files.writeString(
                directory.resolve("broken.jq"), "module namespace m = \"urn:m\";\n\n\n\ndeclare variable $m:a := ;\n");
        assertEquals(
                OBJECT,
                typeAt(
                        "import module namespace m = \"urn:m\" at \"broken.jq\"; let $x| := {\"a\": 1} return $x",
                        directory.resolve("query.jq").toUri()));
    }

    @Test
    void keepsWorkingImportWhenTheQueryIsBroken(@TempDir Path directory) throws IOException {
        Files.writeString(directory.resolve("lib.jq"), LIBRARY);
        assertEquals(
                "xs:integer",
                typeAt(
                        LIBRARY_IMPORT + "let $x| := $l:v return $x.",
                        directory.resolve("query.jq").toUri()));
    }

    @Test
    void keepsWorkingImportWhenAnotherDeclarationIsBroken(@TempDir Path directory) throws IOException {
        Files.writeString(directory.resolve("lib.jq"), LIBRARY);
        assertEquals(
                "xs:integer",
                typeAt(
                        LIBRARY_IMPORT + "declare function g( { 1 };\nlet $x| := $l:v return $x",
                        directory.resolve("query.jq").toUri()));
    }

    @ParameterizedTest
    @MethodSource("brokenLibraries")
    void keepsWorkingImportBeforeABrokenLibrary(String brokenLibrary, @TempDir Path directory) throws IOException {
        Files.writeString(directory.resolve("lib.jq"), LIBRARY);
        Files.writeString(directory.resolve("broken.jq"), brokenLibrary);
        assertEquals(
                "xs:integer",
                typeAt(
                        LIBRARY_IMPORT
                                + "import module namespace m = \"urn:m\" at \"broken.jq\";\n"
                                + "let $x| := $l:v return $x",
                        directory.resolve("query.jq").toUri()));
    }

    private static Stream<String> brokenLibraries() {
        String header = "module namespace m = \"urn:m\";\n";
        return Stream.of(
                header + "declare variable $m:a := ;\n",
                header + "declare variable $m:a := $m:a;\n",
                header + "declare variable $m:a := 1;\ndeclare variable $m:a := 2;\n");
    }

    @Test
    void keepsDeclarationOnTheLineOfAnErrorInALibrary(@TempDir Path directory) throws IOException {
        Files.writeString(
                directory.resolve("broken.jq"), "module namespace m = \"urn:m\";\n\n\n\ndeclare variable $m:a := ;\n");
        assertEquals(
                OBJECT,
                typeAt(
                        "import module namespace m = \"urn:m\" at \"broken.jq\";\n\n\n\n"
                                + "declare variable $keep| := {\"a\": 1};\n$keep",
                        directory.resolve("query.jq").toUri()));
    }

    @Test
    void usesTheFunctionsOfTheLanguageOfTheModule() {
        assertEquals("xs:integer", typeAt("let $y| := integer(\"1\") return nope()", JSONIQ_URI));
        assertNull(typeAt("let $y| := integer(\"1\") return nope()", XQUERY_URI));
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
