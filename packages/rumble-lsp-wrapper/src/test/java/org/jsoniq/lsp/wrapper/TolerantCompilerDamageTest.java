package org.jsoniq.lsp.wrapper;

import java.net.URI;
import java.util.ArrayList;
import java.util.Collections;
import java.util.IdentityHashMap;
import java.util.List;
import java.util.Set;
import java.util.regex.Matcher;
import java.util.regex.Pattern;
import java.util.stream.Stream;

import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.Arguments;
import org.junit.jupiter.params.provider.MethodSource;

import static org.junit.jupiter.api.Assertions.assertEquals;

import org.rumbledb.compiler.TolerantCompiler;
import org.rumbledb.config.RumbleConfiguration;
import org.rumbledb.expressions.Node;

/**
 * Compiles queries damaged at every token, as they are while being typed. The compiler must recover from all of them, so
 * that an unfinished expression does not lose hover and completion for the whole query. Scripting statements do not
 * recover yet, so they are left out.
 */
class TolerantCompilerDamageTest {
    private static final Pattern TOKEN_END = Pattern.compile("[\\s(){}\\[\\],;.:/!=<>\"$]");
    private static final URI JSONIQ_URI = URI.create("file:///damage.jq");
    private static final URI XQUERY_URI = URI.create("file:///damage.xq");

    private static final List<String> SHARED_QUERIES = List.of(
            "declare variable $d := 1; declare function local:f($p) { $p + 1 }; let $a := local:f($d) return $a",
            "for $x at $i allowing empty in (1, 2) where $x gt 1 group by $k := $x order by $k descending return $k",
            "for tumbling window $w in (1, 2) start at $s when true() end at $e when true() return $w",
            "let $a := 1 return if ($a eq 1) then ($a, 2) else [$a][[1]]",
            "let $a := 1 return switch ($a) case 1 return 2 default return 3",
            "let $a := 1 return typeswitch ($a) case $v as integer return $v default $d return $d",
            "let $a := 1 return try { $a div 0 } catch err:FOAR0001 | * { 0 }",
            "let $a := 1 return (some $x in ($a, 2), $y in $x satisfies $y gt 1, every $z in $a satisfies $z)",
            "let $a := 1 return ($a instance of integer, $a treat as integer, $a cast as string, $a castable as string)",
            "let $f := function($x as integer) as integer { $x } return ($f(1), $f(?), abs#1, 1 to 2, -1, 1 ! $$)",
            "let $a := 1 return copy $c := $a modify delete json $c.b return $c");

    private static final List<String> JSONIQ_QUERIES = List.of(
            "let $o := {\"a\": {\"b\": [1, 2]}, \"c\": 2} return ($o.a.b[[1]], $o.a.b[], $o[$$.c eq 2], {| $o |})",
            "let $o := {\"a\": 1} return (insert json \"b\": 2 into $o, replace value of json $o.a with 2,"
                    + " rename json $o.a as \"c\", append json 1 into [])");

    private static final List<String> XQUERY_QUERIES = List.of(
            "let $o := <a b=\"{1}\"><c>{1}</c>text</a> return ($o/c, $o//c, $o/@b, $o/c[1], $o/child::c, $o/..)",
            "let $o := element a { attribute b { 1 }, text { 2 } } return <x xmlns:n=\"urn:n\" y=\"1\">{$o/n:c}</x>",
            "let $m := map { \"a\": 1 } return ($m?a, $m(\"a\"), array { 1 }?1, [1]?*)");

    private static Stream<Arguments> damagedQueries() {
        List<Arguments> queries = new ArrayList<>();
        for (String query : SHARED_QUERIES) {
            addDamaged(queries, query, JSONIQ_URI);
            addDamaged(queries, query, XQUERY_URI);
        }
        JSONIQ_QUERIES.forEach(query -> addDamaged(queries, query, JSONIQ_URI));
        XQUERY_QUERIES.forEach(query -> addDamaged(queries, query, XQUERY_URI));
        return queries.stream();
    }

    /** The query cut off after each token, and without each token. */
    private static void addDamaged(List<Arguments> queries, String query, URI uri) {
        List<Integer> ends = new ArrayList<>();
        Matcher matcher = TOKEN_END.matcher(query);
        while (matcher.find()) {
            ends.add(matcher.end());
        }
        for (int i = 0; i < ends.size(); i++) {
            queries.add(Arguments.of(query.substring(0, ends.get(i)), uri));
            if (i + 1 < ends.size()) {
                queries.add(Arguments.of(query.substring(0, ends.get(i)) + query.substring(ends.get(i + 1)), uri));
            }
        }
    }

    @ParameterizedTest
    @MethodSource("damagedQueries")
    void recoversWithATree(String query, URI uri) {
        List<Node> nodes = new ArrayList<>();
        collect(TolerantCompiler.compile(query, uri, RumbleConfiguration.defaultConfiguration()), nodes);
        Set<Node> distinct = Collections.newSetFromMap(new IdentityHashMap<>());
        distinct.addAll(nodes);
        assertEquals(nodes.size(), distinct.size(), "A node is used twice");
    }

    private static void collect(Node node, List<Node> nodes) {
        nodes.add(node);
        node.getChildren().forEach(child -> collect(child, nodes));
    }
}
