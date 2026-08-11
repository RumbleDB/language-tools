import { WorkspaceController } from "server/workspace/controller.js";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { FileChangeType, type FileEvent } from "vscode-languageserver/node";

const workspaceService = vi.hoisted(() => ({
    replaceWorkspaceDocuments: vi.fn<(uris: readonly string[]) => void>(),
    updateWorkspaceDocuments: vi.fn<(changes: readonly FileEvent[]) => void>(),
}));
const discoverWorkspaceDocumentUris = vi.hoisted(() =>
    vi.fn<(folderUris: readonly string[]) => Promise<readonly string[]>>(),
);

vi.mock("server/workspace/service.js", () => workspaceService);
vi.mock("server/workspace/files.js", () => ({ discoverWorkspaceDocumentUris }));

beforeEach(() => {
    vi.resetAllMocks();
});

describe("workspace controller", () => {
    it("serializes discovery and document changes", async () => {
        const events: string[] = [];
        workspaceService.replaceWorkspaceDocuments.mockImplementation((uris) => {
            events.push(`replace:${uris.join(",")}`);
        });
        workspaceService.updateWorkspaceDocuments.mockImplementation((changes) => {
            events.push(`update:${changes.map((change) => change.uri).join(",")}`);
        });
        discoverWorkspaceDocumentUris.mockImplementation(async (folderUris) => {
            events.push(`discover:${folderUris.join(",")}`);
            return folderUris.map((uri) => `${uri}/document.jq`);
        });
        const controller = new WorkspaceController(() => undefined);

        controller.initialize(["file:///workspace"]);
        controller.updateDocuments([
            { uri: "file:///workspace/changed.jq", type: FileChangeType.Changed },
        ]);
        await controller.ready();

        expect(events).toEqual([
            "discover:file:///workspace",
            "replace:file:///workspace/document.jq",
            "update:file:///workspace/changed.jq",
        ]);
    });

    it("rebuilds with the current workspace folders", async () => {
        const events: string[] = [];
        discoverWorkspaceDocumentUris.mockImplementation(async (folderUris) => {
            events.push(`discover:${folderUris.join(",")}`);
            return folderUris.map((uri) => `${uri}/document.jq`);
        });
        const controller = new WorkspaceController(() => undefined);

        controller.initialize(["file:///first"]);
        controller.updateFolders(["file:///second"], ["file:///first"]);
        await controller.ready();

        expect(events).toContain("discover:file:///second");
    });

    it("continues processing after a failed operation", async () => {
        const errors: unknown[] = [];
        const events: string[] = [];
        workspaceService.updateWorkspaceDocuments.mockImplementation((changes) => {
            events.push(`update:${changes.map((change) => change.uri).join(",")}`);
        });
        discoverWorkspaceDocumentUris.mockRejectedValue(new Error("discovery failed"));
        const controller = new WorkspaceController((error) => errors.push(error));

        controller.initialize(["file:///workspace"]);
        controller.updateDocuments([
            { uri: "file:///workspace/changed.jq", type: FileChangeType.Changed },
        ]);
        await controller.ready();

        expect(errors).toHaveLength(1);
        expect(events).toEqual(["update:file:///workspace/changed.jq"]);
    });
});
