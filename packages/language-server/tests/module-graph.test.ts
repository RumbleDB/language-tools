import { ModuleGraph } from "server/analysis/module-graph.js";
import { describe, expect, it } from "vitest";

describe("module graph", () => {
    it("finds transitive dependents through cycles", () => {
        const graph = new ModuleGraph();
        graph.replaceDependencies("file:///a.jq", new Set(["file:///b.jq"]));
        graph.replaceDependencies("file:///b.jq", new Set(["file:///a.jq"]));
        graph.replaceDependencies("file:///main.jq", new Set(["file:///a.jq"]));

        expect([...graph.affectedBy(["file:///b.jq"])]).toEqual([
            "file:///b.jq",
            "file:///a.jq",
            "file:///main.jq",
        ]);
    });

    it("replaces stale reverse dependency edges", () => {
        const graph = new ModuleGraph();
        graph.replaceDependencies("file:///main.jq", new Set(["file:///old.jq"]));
        graph.replaceDependencies("file:///main.jq", new Set(["file:///new.jq"]));

        expect([...graph.affectedBy(["file:///old.jq"])]).toEqual(["file:///old.jq"]);
        expect([...graph.affectedBy(["file:///new.jq"])]).toEqual([
            "file:///new.jq",
            "file:///main.jq",
        ]);
    });

    it("removes a document's outgoing dependency edges", () => {
        const graph = new ModuleGraph();
        graph.replaceDependencies("file:///module.jq", new Set(["file:///dependency.jq"]));

        graph.removeOutgoingDependencies("file:///module.jq");

        expect([...graph.affectedBy(["file:///dependency.jq"])]).toEqual(["file:///dependency.jq"]);
    });
});
