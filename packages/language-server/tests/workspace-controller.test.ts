import { WorkspaceController } from "server/workspace/controller.js";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { FileChangeType, type FileEvent } from "vscode-languageserver/node";

const workspaceService = vi.hoisted(() => ({
    replaceDocuments: vi.fn<(uris: readonly string[]) => void>(),
    updateDocuments: vi.fn<(changes: readonly FileEvent[]) => void>(),
}));
const discoverWorkspaceDocumentUris = vi.hoisted(() =>
    vi.fn<(folderUris: readonly string[]) => Promise<readonly string[]>>(),
);
const logger = vi.hoisted(() => ({ error: vi.fn() }));

vi.mock("server/workspace/files.js", () => ({ discoverWorkspaceDocumentUris }));
vi.mock("server/utils/logger.js", () => ({ createLogger: () => logger }));

beforeEach(() => {
    vi.resetAllMocks();
});

describe("workspace controller", () => {
    it("serializes discovery and document changes", async () => {
        const events: string[] = [];
        workspaceService.replaceDocuments.mockImplementation((uris) => {
            events.push(`replace:${uris.join(",")}`);
        });
        workspaceService.updateDocuments.mockImplementation((changes) => {
            events.push(`update:${changes.map((change) => change.uri).join(",")}`);
        });
        discoverWorkspaceDocumentUris.mockImplementation(async (folderUris) => {
            events.push(`discover:${folderUris.join(",")}`);
            return folderUris.map((uri) => `${uri}/document.jq`);
        });
        const controller = new WorkspaceController(workspaceService);

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
        const controller = new WorkspaceController(workspaceService);

        controller.initialize(["file:///first"]);
        controller.updateFolders(["file:///second"], ["file:///first"]);
        await controller.ready();

        expect(events).toContain("discover:file:///second");
    });

    it("continues processing after a failed operation", async () => {
        const events: string[] = [];
        workspaceService.updateDocuments.mockImplementation((changes) => {
            events.push(`update:${changes.map((change) => change.uri).join(",")}`);
        });
        const error = new Error("discovery failed");
        discoverWorkspaceDocumentUris.mockRejectedValue(error);
        const controller = new WorkspaceController(workspaceService);

        controller.initialize(["file:///workspace"]);
        controller.updateDocuments([
            { uri: "file:///workspace/changed.jq", type: FileChangeType.Changed },
        ]);
        await controller.ready();

        expect(logger.error).toHaveBeenCalledWith("Workspace indexing failed.", error);
        expect(events).toEqual(["update:file:///workspace/changed.jq"]);
    });
});
