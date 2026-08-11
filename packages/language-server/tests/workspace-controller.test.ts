import {
    WorkspaceController,
    type WorkspaceControllerBackend,
} from "server/workspace/controller.js";
import { describe, expect, it } from "vitest";

function testBackend(events: string[]): WorkspaceControllerBackend {
    return {
        async discover(folderUris) {
            events.push(`discover:${folderUris.join(",")}`);
            return folderUris.map((uri) => `${uri}/document.jq`);
        },
        replaceDocuments(uris) {
            events.push(`replace:${uris.join(",")}`);
        },
        updateDocuments(changes) {
            events.push(`update:${changes.map((change) => change.uri).join(",")}`);
        },
    };
}

describe("workspace controller", () => {
    it("serializes discovery and document changes", async () => {
        const events: string[] = [];
        const controller = new WorkspaceController(() => undefined, testBackend(events));

        controller.initialize(["file:///workspace"]);
        controller.updateDocuments([{ uri: "file:///workspace/changed.jq", kind: "changed" }]);
        await controller.ready();

        expect(events).toEqual([
            "discover:file:///workspace",
            "replace:file:///workspace/document.jq",
            "update:file:///workspace/changed.jq",
        ]);
    });

    it("rebuilds with the current workspace folders", async () => {
        const events: string[] = [];
        const controller = new WorkspaceController(() => undefined, testBackend(events));

        controller.initialize(["file:///first"]);
        controller.updateFolders(["file:///second"], ["file:///first"]);
        await controller.ready();

        expect(events).toContain("discover:file:///second");
    });

    it("continues processing after a failed operation", async () => {
        const errors: unknown[] = [];
        const events: string[] = [];
        const backend = testBackend(events);
        backend.discover = async () => {
            throw new Error("discovery failed");
        };
        const controller = new WorkspaceController((error) => errors.push(error), backend);

        controller.initialize(["file:///workspace"]);
        controller.updateDocuments([{ uri: "file:///workspace/changed.jq", kind: "changed" }]);
        await controller.ready();

        expect(errors).toHaveLength(1);
        expect(events).toEqual(["update:file:///workspace/changed.jq"]);
    });
});
