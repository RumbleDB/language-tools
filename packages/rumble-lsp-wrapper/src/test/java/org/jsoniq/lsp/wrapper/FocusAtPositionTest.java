package org.jsoniq.lsp.wrapper;

import java.io.IOException;
import java.net.URI;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.List;

import org.jsoniq.lsp.wrapper.handlers.FocusAtPosition;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNull;

/** Queries with `|` at the position, which is right after the token that the lookup or step follows. */
class FocusAtPositionTest {
    private static final URI JSONIQ_URI = URI.create("file:///focus.jq");
    private static final URI XQUERY_URI = URI.create("file:///focus.xq");
    private static final String OBJECT = "{ a: xs:integer, b: xs:string }";
    private static final String LET_A = "let $a := {\"a\": 1, \"b\": \"x\"} ";

    private static final String ORDER_SCHEMA =
            """
            <xs:schema xmlns:xs="http://www.w3.org/2001/XMLSchema" xmlns:o="urn:order"
                       targetNamespace="urn:order" elementFormDefault="qualified">
                <xs:element name="order">
                    <xs:complexType>
                        <xs:sequence>
                            <xs:element name="line" maxOccurs="unbounded">
                                <xs:complexType>
                                    <xs:sequence><xs:element name="price" type="xs:decimal"/></xs:sequence>
                                    <xs:attribute name="sku" type="xs:string"/>
                                </xs:complexType>
                            </xs:element>
                        </xs:sequence>
                        <xs:attribute name="id" type="xs:integer" use="required"/>
                    </xs:complexType>
                </xs:element>
            </xs:schema>
            """;

    private static final String LET_ORDER =
            """
            import schema namespace o = "urn:order" at "order.xsd";
            let $o := validate { <o:order id="1"/> }
            """;

    private static final List<String> ORDER_STEPS =
            List.of("o:line: element(o:line, <anonymous>)+", "@id: attribute(id, xs:integer)");

    private static final List<String> ORDER_STEPS_THROUGH_DESCENDANTS = List.of(
            "o:line: element(o:line, <anonymous>)*",
            "o:price: element(o:price, xs:decimal)*",
            "@id: attribute(id, xs:integer)*",
            "@sku: attribute(sku, xs:string)*");

    private final FocusAtPosition focusAtPosition = new FocusAtPosition();

    @ParameterizedTest
    @ValueSource(
            strings = {
                "return $a.|",
                "return $a.|b",
                "return $a.|nope",
                "return ($a.|",
                "return ($a.|, 1)",
                "return abs($a.|",
                "return nope($a.|",
                "return 1 + $a.|",
                "return (1, $a.|",
                "return {\"k\": $a.|}",
                "return if (true) then 1 else $a.|",
                "return ($a.a, $a.|b)",
                "let $b := $a.|",
                "let $b := $a.|\nreturn $b",
                "let $b := $a.| let $c := return 1",
                "let $b := $a.| return $nope",
                "return $a.|\n(1, 2)",
            })
    void findsWhatAnObjectLookupAppliesTo(String markedQuery) {
        assertEquals(OBJECT, focusType(LET_A + markedQuery, JSONIQ_URI));
    }

    @Test
    void findsWhatAnObjectLookupAppliesToInADeclaration() {
        assertEquals(OBJECT, focusType("declare function local:f() { " + LET_A + "return $a.| }; 1", JSONIQ_URI));
    }

    @Test
    void findsWhatTheLastObjectLookupAppliesTo() {
        assertEquals("{ b: xs:integer }", focusType("let $a := {\"a\": {\"b\": 1}} return $a.a.|", JSONIQ_URI));
    }

    @Test
    void findsNothingWithoutAFocus() {
        assertNull(this.focusAtPosition
                .findFocus(LET_A + "return ($a, 1)", JSONIQ_URI, new Position(0, LET_A.length()))
                .sequenceType());
    }

    @ParameterizedTest
    @ValueSource(
            strings = {
                "return $o/|",
                "return $o/|@",
                "return $o/|o:li",
                "return ($o/|",
                "return ($o/|, 1)",
                "return data($o/|",
                "return $o/o:line and $o/|",
                "return if (1) then 1 else $o/|",
                "let $b := $o/| return $b",
                "return $o !|",
                "return $o !| ",
                "return $o !| o:",
            })
    void listsTheStepsThatTheSchemaDeclares(String markedQuery, @TempDir Path directory) throws IOException {
        for (String extension : List.of("xq", "jq")) {
            assertEquals(ORDER_STEPS, orderSteps(markedQuery, extension, directory), extension);
        }
    }

    @ParameterizedTest
    @ValueSource(strings = {"return $o[|]", "return $o[|", "return $o[|o:li]", "return $o[1 + |o:]"})
    void listsTheStepsInAPredicate(String markedQuery, @TempDir Path directory) throws IOException {
        assertEquals(ORDER_STEPS, orderSteps(markedQuery, "xq", directory));
    }

    @ParameterizedTest
    @ValueSource(
            strings = {"return $o//|", "return $o//|o:li", "return ($o//|, 1)", "return $o/descendant-or-self::node()/|"
            })
    void listsTheStepsBelowDescendants(String markedQuery, @TempDir Path directory) throws IOException {
        for (String extension : List.of("xq", "jq")) {
            assertEquals(ORDER_STEPS_THROUGH_DESCENDANTS, orderSteps(markedQuery, extension, directory), extension);
        }
    }

    @Test
    void listsNoStepsForUntypedNodes() {
        assertNull(find("let $x := <order/> return $x/|", XQUERY_URI).pathSteps());
    }

    private String focusType(String markedQuery, URI uri) {
        var type = find(markedQuery, uri).sequenceType();
        return type == null ? null : type.toString();
    }

    private List<String> orderSteps(String markedQuery, String extension, Path directory) throws IOException {
        Files.writeString(directory.resolve("order.xsd"), ORDER_SCHEMA);
        var steps = find(
                        LET_ORDER + markedQuery,
                        directory.resolve("query." + extension).toUri())
                .pathSteps();
        return steps == null
                ? null
                : steps.stream()
                        .map(step -> (step.attribute() ? "@" : "") + step.name() + ": " + step.sequenceType())
                        .toList();
    }

    private FocusAtPosition.Result find(String markedQuery, URI uri) {
        int marker = markedQuery.indexOf('|');
        String before = markedQuery.substring(0, marker);
        int line = (int) before.chars().filter(character -> character == '\n').count();
        int character = marker - (before.lastIndexOf('\n') + 1);
        return this.focusAtPosition.findFocus(markedQuery.replace("|", ""), uri, new Position(line, character));
    }
}
