package org.jsoniq.lsp.wrapper;

import java.lang.management.ManagementFactory;
import java.net.URI;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.ArrayList;
import java.util.Base64;
import java.util.concurrent.TimeUnit;

import org.apache.spark.sql.SparkSession;
import org.jsoniq.lsp.wrapper.handlers.RunQuery;
import org.jsoniq.lsp.wrapper.messages.Request;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertTrue;

import com.fasterxml.jackson.databind.ObjectMapper;

class RunQueryProcessTest {
    @TempDir
    Path directory;

    @Test
    void localQueriesAvoidSparkAndDistributedQueriesStillStartIt() throws Exception {
        var process = start(LazySparkProbe.class.getName());
        process.getOutputStream().close();
        awaitSuccess(process);
    }

    @Test
    void daemonWritesSeparateJsonLinesForConsecutiveResults() throws Exception {
        var mapper = new ObjectMapper();
        var process = start(Main.class.getName(), "--daemon");
        try (var input = process.outputWriter(StandardCharsets.UTF_8)) {
            for (int id = 1; id <= 2; id++) {
                var body = Base64.getEncoder().encodeToString("(42, [1, 2])".getBytes(StandardCharsets.UTF_8));
                input.write(mapper.writeValueAsString(new Request(id, "run-query", body, "file:///query.jq", null)));
                input.newLine();
            }
        }
        awaitSuccess(process);
        var lines = Files.readAllLines(this.directory.resolve("stdout"));
        assertEquals(2, lines.size());
        for (int index = 0; index < lines.size(); index++) {
            assertTrue(lines.get(index).startsWith("{"));
            var response = mapper.readTree(lines.get(index));
            assertEquals(index + 1, response.get("id").asInt());
            assertEquals(
                    "42",
                    response.path("body")
                            .path("items")
                            .get(0)
                            .path("serialized")
                            .asText());
            assertEquals(
                    "array",
                    response.path("body").path("items").get(1).path("kind").asText());
        }
    }

    private Process start(String mainClass, String... arguments) throws Exception {
        var command = new ArrayList<String>();
        command.add(Path.of(System.getProperty("java.home"), "bin", "java").toString());
        ManagementFactory.getRuntimeMXBean().getInputArguments().stream()
                .filter(argument -> argument.startsWith("--add-opens="))
                .forEach(command::add);
        command.add("-cp");
        command.add(System.getProperty("java.class.path"));
        command.add(mainClass);
        command.addAll(java.util.List.of(arguments));
        return new ProcessBuilder(command)
                .redirectOutput(this.directory.resolve("stdout").toFile())
                .redirectError(this.directory.resolve("stderr").toFile())
                .start();
    }

    private void awaitSuccess(Process process) throws Exception {
        try {
            assertTrue(process.waitFor(60, TimeUnit.SECONDS), "Query process timed out");
            assertEquals(0, process.exitValue(), () -> {
                try {
                    return Files.readString(this.directory.resolve("stderr"));
                } catch (Exception exception) {
                    return exception.toString();
                }
            });
        } finally {
            if (process.isAlive()) process.destroyForcibly();
        }
    }

    /** A fresh JVM prevents Spark sessions from other tests masking eager initialization. */
    public static class LazySparkProbe {
        public static void main(String[] args) {
            var handler = new RunQuery();
            var uri = URI.create("file:///query.jq");
            for (int run = 0; run < 3; run++) {
                var result = handler.run("1 + 1", uri);
                assertNull(result.error());
                assertEquals("2", result.items().get(0).serialized());
                assertTrue(SparkSession.getDefaultSession().isEmpty(), "Local query started Spark");
            }
            var result = handler.run("count(distinct-values(parallelize((1, 1.0, 1e0))))", uri);
            assertNull(result.error());
            assertEquals("1", result.items().get(0).serialized());
            assertTrue(SparkSession.getDefaultSession().isDefined(), "Distributed query did not start Spark");
            SparkSession.getDefaultSession().get().stop();
        }
    }
}
