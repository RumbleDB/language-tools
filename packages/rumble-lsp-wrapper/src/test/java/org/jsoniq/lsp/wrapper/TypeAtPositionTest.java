package org.jsoniq.lsp.wrapper;

import java.io.IOException;
import java.net.URI;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.Base64;
import java.util.List;

import org.jsoniq.lsp.wrapper.handlers.TypeAtPosition;
import org.jsoniq.lsp.wrapper.messages.Request;
import org.jsoniq.lsp.wrapper.types.TypeDefinition.ArrayTypeDefinition;
import org.jsoniq.lsp.wrapper.types.TypeDefinition.ObjectTypeDefinition;
import org.jsoniq.lsp.wrapper.types.TypeDefinition.UnionTypeDefinition;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertInstanceOf;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertTrue;

class TypeAtPositionTest {
    private static final URI DOCUMENT_URI = URI.create("file:///type-at-position.jq");

    private final TypeAtPosition typeAtPosition = new TypeAtPosition();

    @Test
    void returnsOuterExpressionEndingAtPosition() {
        String query = "((1 + 2) * 3)";

        TypeAtPosition.Result result =
                this.typeAtPosition.findType(query, DOCUMENT_URI, new Position(0, query.length()));

        assertNotNull(result.sequenceType());
        assertEquals("xs:integer", result.sequenceType().toString());
        assertEquals(new Range(new Position(0, 0), new Position(0, query.length())), result.range());
    }

    @Test
    void listsPathStepsThatTheSchemaDeclares(@TempDir Path directory) throws IOException {
        Files.writeString(
                directory.resolve("order.xsd"),
                """
                <xs:schema xmlns:xs="http://www.w3.org/2001/XMLSchema" xmlns:o="urn:order"
                           targetNamespace="urn:order" elementFormDefault="qualified">
                    <xs:element name="order">
                        <xs:complexType>
                            <xs:sequence>
                                <xs:element name="price" type="xs:decimal" maxOccurs="unbounded"/>
                            </xs:sequence>
                            <xs:attribute name="id" type="xs:integer" use="required"/>
                        </xs:complexType>
                    </xs:element>
                </xs:schema>
                """);
        String query = "import schema namespace o = \"urn:order\" at \"order.xsd\";\n(validate { <o:order/> })";

        TypeAtPosition.Result result = this.typeAtPosition.findType(
                query, directory.resolve("query.xq").toUri(), positionAtOffset(query, query.length()));

        assertEquals(
                List.of("o:price: element(o:price, xs:decimal)+"),
                result.children().stream()
                        .map(step -> step.name() + ": " + step.sequenceType())
                        .toList());
        assertEquals(
                List.of("id: attribute(id, xs:integer)"),
                result.attributes().stream()
                        .map(step -> step.name() + ": " + step.sequenceType())
                        .toList());
    }

    @Test
    void listsNoPathStepsForUntypedNodes() {
        TypeAtPosition.Result result =
                this.typeAtPosition.findType("<order/>", URI.create("file:///query.xq"), new Position(0, 8));

        assertNull(result.children());
        assertNull(result.attributes());
    }

    @Test
    void returnsEmptySequenceTypeInStandardSyntax() {
        TypeAtPosition.Result result = this.typeAtPosition.findType("()", DOCUMENT_URI, new Position(0, 0));

        assertNotNull(result.sequenceType());
        assertEquals("empty-sequence()", result.sequenceType().toString());
    }

    @Test
    void returnsTypeAtVariableDeclarationName() {
        String query = """
                declare variable $a := 1;

                $a
                """;
        int declarationOffset = query.indexOf("$a") + 1;

        TypeAtPosition.Result result =
                this.typeAtPosition.findType(query, DOCUMENT_URI, positionAtOffset(query, declarationOffset));

        assertNotNull(result.sequenceType());
        assertEquals("xs:integer", result.sequenceType().toString());
        assertEquals(
                new Range(
                        positionAtOffset(query, query.indexOf("$a")),
                        positionAtOffset(query, query.indexOf("$a") + "$a".length())),
                result.range());
    }

    @Test
    void returnsForBindingTypeInsteadOfFlworResultType() {
        String query =
                """
                for $i in 1 to 10
                return {
                    "a": $i
                }
                """;
        assertVariableType(query, DOCUMENT_URI, "$i", 0, "xs:integer");
        assertVariableType(query, DOCUMENT_URI, "$i", 1, "xs:integer");
    }

    @Test
    void preservesObjectFieldsWithOptionalMathResult() {
        String query = "for $i in 1 to 10 return {\"i\": $i, \"power_of_two\": math:pow($i, 2)}";
        TypeAtPosition.Result result =
                this.typeAtPosition.findType(query, DOCUMENT_URI, new Position(0, query.indexOf('{')));

        assertNotNull(result.sequenceType());
        var objectType = assertInstanceOf(
                ObjectTypeDefinition.class, result.sequenceType().itemType());
        assertEquals("object", objectType.kind());
        assertEquals("xs:integer", objectType.fields().get("i").type().toString());
        assertEquals(
                "(xs:double | js:null)",
                objectType.fields().get("power_of_two").type().toString());
        assertEquals("", result.sequenceType().arity());
    }

    @Test
    void representsWrappedSequenceAlternativesInObjectFields() {
        String query = "declare variable $values as xs:integer* := (); {\"value\": $values, \"known\": 1}";
        TypeAtPosition.Result result =
                this.typeAtPosition.findType(query, DOCUMENT_URI, new Position(0, query.indexOf('{')));

        assertNotNull(result.sequenceType());
        var objectType = assertInstanceOf(
                ObjectTypeDefinition.class, result.sequenceType().itemType());
        assertEquals(
                "{ value: (xs:integer | [xs:integer] | js:null), known: xs:integer }",
                result.sequenceType().toString());
        var union = assertInstanceOf(
                UnionTypeDefinition.class, objectType.fields().get("value").type());
        assertEquals("union", union.kind());
        assertEquals(3, union.members().size());
        assertEquals(
                "xs:integer",
                assertInstanceOf(ArrayTypeDefinition.class, union.members().get(1))
                        .content()
                        .toString());
    }

    @ParameterizedTest
    @ValueSource(strings = {"jq", "xq"})
    void returnsTypesAtMultipleShadowedForBindingsAndPosition(String extension) {
        String query = "for $i at $pos in 1 to 3, $i in string($i) return ($i, $pos)";
        URI uri = URI.create("file:///same-clause-shadowing." + extension);
        assertVariableType(query, uri, "$i", 0, "xs:integer");
        assertVariableType(query, uri, "$i", 1, "xs:string");
        // The new binding is not in scope in its own input expression.
        assertVariableType(query, uri, "$i", 2, "xs:integer");
        assertVariableType(query, uri, "$i", 3, "xs:string");
        assertVariableType(query, uri, "$pos", 0, "xs:integer");
    }

    @ParameterizedTest
    @ValueSource(strings = {"jq", "xq"})
    void returnsLetSequenceTypeAndRespectsShadowing(String extension) {
        String query = "for $i in 1 to 10 return (let $i := (\"a\", \"b\") return $i)";
        URI uri = URI.create("file:///shadowed-bindings." + extension);
        assertVariableType(query, uri, "$i", 0, "xs:integer");
        assertVariableType(query, uri, "$i", 1, "xs:string+");
        assertVariableType(query, uri, "$i", 2, "xs:string+");
    }

    @ParameterizedTest
    @ValueSource(strings = {"jq", "xq"})
    void returnsTypesAtMultipleGroupingBindings(String extension) {
        String query =
                "for $i at $pos in 1 to 10 group by $key := $i mod 2, $label := string($i mod 2), $pos return ($key, $label, $i, $pos)";
        URI uri = URI.create("file:///group-bindings." + extension);
        assertVariableType(query, uri, "$key", 0, "xs:integer");
        assertVariableType(query, uri, "$label", 0, "xs:string");
        assertVariableType(query, uri, "$pos", 1, "xs:integer");
        assertVariableType(query, uri, "$i", 0, "xs:integer");
        assertVariableType(query, uri, "$i", 3, "xs:integer+");
    }

    @ParameterizedTest
    @ValueSource(strings = {"jq", "xq"})
    void returnsWindowAndCountBindingTypes(String extension) {
        String query =
                """
                for tumbling window $w as xs:integer+ in 1 to 4
                    start $s at $sp previous $prev next $next when true()
                    end $e at $ep previous $eprev next $enext when true()
                count $count
                return ($w, $s, $sp, $prev, $next, $e, $ep, $eprev, $enext, $count)
                """;
        URI uri = URI.create("file:///window-bindings." + extension);
        assertVariableType(query, uri, "$w", 0, "xs:integer+");
        for (String name : new String[] {"$prev", "$next", "$eprev", "$enext"}) {
            assertVariableType(query, uri, name, 0, "xs:integer?");
        }
        for (String name : new String[] {"$s", "$sp", "$e", "$ep", "$count"}) {
            assertVariableType(query, uri, name, 0, "xs:integer");
        }
    }

    @ParameterizedTest
    @ValueSource(strings = {"jq", "xq"})
    void returnsParameterAndQuantifiedBindingTypes(String extension) {
        String query =
                """
                declare function local:f($arg as xs:integer) {
                    let $fn := function($arg as xs:string) {
                        some $v in $arg satisfies $v eq "a"
                    }
                    return $fn("a")
                };
                local:f(1)
                """;
        URI uri = URI.create("file:///function-bindings." + extension);
        assertVariableType(query, uri, "$arg", 0, "xs:integer");
        assertVariableType(query, uri, "$arg", 1, "xs:string");
        assertVariableType(query, uri, "$v", 0, "xs:string");
        assertVariableType(query, uri, "$v", 1, "xs:string");
    }

    @ParameterizedTest
    @ValueSource(strings = {"jq", "xq"})
    void distinguishesTypeswitchCaseAndDefaultBindings(String extension) {
        String query =
                """
                typeswitch(1)
                case $v as xs:string return string($v)
                case $v as xs:integer return string($v)
                default $v return string($v)
                """;
        URI uri = URI.create("file:///typeswitch-bindings." + extension);
        assertVariableType(query, uri, "$v", 0, "xs:string");
        assertVariableType(query, uri, "$v", 2, "xs:integer");
        assertVariableType(query, uri, "$v", 4, "xs:integer");
    }

    @Test
    void returnsScriptTypeswitchAndCopyBindingTypes() {
        String query =
                """
                variable $value as xs:integer := 1;
                typeswitch($value)
                case $branch as xs:string return $value := string-length($branch);
                default $branch return $value := $branch;
                copy $obj := {"a": $value}
                modify delete json $obj.missing
                return $value
                """;
        assertVariableType(query, DOCUMENT_URI, "$value", 0, "xs:integer");
        assertVariableType(query, DOCUMENT_URI, "$branch", 0, "xs:string");
        assertVariableType(query, DOCUMENT_URI, "$branch", 2, "xs:integer");
        assertVariableType(query, DOCUMENT_URI, "$obj", 0, "{ a: xs:integer }");
    }

    @Test
    void returnsReturnTypeAtFunctionDeclarationName() {
        String query =
                """
                declare function local:f() {
                    1
                };
                """;
        int declarationOffset = query.indexOf("local:f") + 1;

        TypeAtPosition.Result result =
                this.typeAtPosition.findType(query, DOCUMENT_URI, positionAtOffset(query, declarationOffset));

        assertNotNull(result.sequenceType());
        assertEquals("item*", result.sequenceType().toString());
        assertEquals(
                new Range(
                        positionAtOffset(query, query.indexOf("local:f")),
                        positionAtOffset(query, query.indexOf("local:f") + "local:f".length())),
                result.range());
    }

    @Test
    void returnsNestedObjectLookupType() {
        String query =
                """
                declare variable $a := {
                    "nested": {
                        "value": 1
                    }
                };
                $a.nested
                """;
        int expressionEnd = query.indexOf("$a.nested") + "$a.nested".length();

        TypeAtPosition.Result result =
                this.typeAtPosition.findType(query, DOCUMENT_URI, positionAtOffset(query, expressionEnd));

        assertNotNull(result.sequenceType());
        var objectType = assertInstanceOf(
                ObjectTypeDefinition.class, result.sequenceType().itemType());
        assertEquals("object", objectType.kind());
        assertEquals("xs:integer", objectType.fields().get("value").type().toString());
    }

    @Test
    void returnsObjectLookupExpressionTypeWhenPositionIsInsideLookupKey() {
        String query =
                """
                declare variable $a := {
                    "name": "ada",
                    "details": {
                        "tlf": 1233.2
                    }
                };
                ($a.details.tlf)
                """;
        int detailsOffset = query.indexOf("details.tlf") + "det".length();

        TypeAtPosition.Result result =
                this.typeAtPosition.findType(query, DOCUMENT_URI, positionAtOffset(query, detailsOffset));

        assertNotNull(result.sequenceType());
        var objectType = assertInstanceOf(
                ObjectTypeDefinition.class, result.sequenceType().itemType());
        assertEquals("object", objectType.kind());
        assertEquals("xs:decimal", objectType.fields().get("tlf").type().toString());
        assertEquals(
                new Range(
                        positionAtOffset(query, query.indexOf("$a.details")),
                        positionAtOffset(query, query.indexOf("$a.details") + "$a.details".length())),
                result.range());
    }

    @Test
    void returnsNestedObjectLookupExpressionTypeWhenPositionIsInsideNestedLookupKey() {
        String query =
                """
                declare variable $a := {
                    "name": "ada",
                    "details": {
                        "tlf": 1233.2
                    }
                };
                ($a.details.tlf)
                """;
        int tlfOffset = query.indexOf("tlf)") + "t".length();

        TypeAtPosition.Result result =
                this.typeAtPosition.findType(query, DOCUMENT_URI, positionAtOffset(query, tlfOffset));

        assertNotNull(result.sequenceType());
        assertEquals("xs:decimal", result.sequenceType().toString());
        assertEquals(
                new Range(
                        positionAtOffset(query, query.indexOf("$a.details.tlf")),
                        positionAtOffset(query, query.indexOf("$a.details.tlf") + "$a.details.tlf".length())),
                result.range());
    }

    @Test
    void returnsSmallestExpressionContainingPositionWhenNothingEndsThere() {
        String query = "1 + 20";

        TypeAtPosition.Result result = this.typeAtPosition.findType(query, DOCUMENT_URI, new Position(0, 5));

        assertNotNull(result.sequenceType());
        assertEquals("xs:integer", result.sequenceType().toString());
        assertEquals(new Range(new Position(0, 4), new Position(0, 6)), result.range());
    }

    @Test
    void supportsXQueryDocuments() {
        String query = "((1 + 2) * 3)";

        TypeAtPosition.Result result = this.typeAtPosition.findType(
                query, URI.create("file:///type-at-position.xq"), new Position(0, query.length()));

        assertNotNull(result.sequenceType());
        assertEquals("xs:integer", result.sequenceType().toString());
        assertEquals(new Range(new Position(0, 0), new Position(0, query.length())), result.range());
    }

    @Test
    void handlesDaemonRequestPayload() {
        String query = "1 + 2";
        Request request = new Request(
                1,
                TypeAtPosition.REQUEST_TYPE,
                Base64.getEncoder().encodeToString(query.getBytes(StandardCharsets.UTF_8)),
                "file:///type-at-position.jq",
                new Position(0, query.length()));

        TypeAtPosition.Result result = (TypeAtPosition.Result) this.typeAtPosition.handle(request);

        assertNotNull(result.sequenceType());
        assertEquals("xs:integer", result.sequenceType().toString());
    }

    @Test
    void returnsEmptyResultForInvalidQuery() {
        TypeAtPosition.Result result = this.typeAtPosition.findType("$a.", DOCUMENT_URI, new Position(0, 3));

        assertNull(result.sequenceType());
        assertNull(result.range());
    }

    private static Position positionAtOffset(String source, int offset) {
        int line = 0;
        int character = 0;
        for (int i = 0; i < offset; i++) {
            if (source.charAt(i) == '\n') {
                line++;
                character = 0;
            } else {
                character++;
            }
        }
        return new Position(line, character);
    }

    private void assertVariableType(String query, URI uri, String name, int occurrence, String expectedType) {
        int offset = -1;
        for (int i = 0; i <= occurrence; i++) {
            offset = query.indexOf(name, offset + 1);
            assertTrue(offset >= 0, "Variable occurrence " + i + " must exist");
        }
        Range expectedRange =
                new Range(positionAtOffset(query, offset), positionAtOffset(query, offset + name.length()));
        TypeAtPosition.Result result = this.typeAtPosition.findType(query, uri, positionAtOffset(query, offset + 1));
        assertNotNull(result.sequenceType(), name + " occurrence " + occurrence);
        assertEquals(expectedType, result.sequenceType().toString());
        assertEquals(expectedRange, result.range());
    }
}
