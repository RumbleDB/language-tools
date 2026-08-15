import { WorkspaceService } from "server/workspace/service.js";
import { WorkspaceIndex } from "server/workspace/workspace-index.js";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { FileChangeType } from "vscode-languageserver/node";

const discoverWorkspaceDocumentUris = vi.hoisted(() =>
    vi.fn<(folderUris: readonly string[]) => Promise<readonly string[]>>(),
);
const logger = vi.hoisted(() => ({ error: vi.fn() }));

vi.mock("server/utils/logger.js", () => ({ createLogger: () => logger }));

beforeEach(() => {
    vi.resetAllMocks();
});

describe("workspace service lifecycle", () => {
    it("serializes discovery and document changes", async () => {
        const events: string[] = [];
        const index = new WorkspaceIndex();
        vi.spyOn(index, "replaceWorkspaceDocuments").mockImplementation((uris) => {
            events.push(`replace:${uris.join(",")}`);
        });
        vi.spyOn(index, "updateWorkspaceDocuments").mockImplementation((changes) => {
            events.push(`update:${changes.map((change) => change.uri).join(",")}`);
        });
        discoverWorkspaceDocumentUris.mockImplementation(async (folderUris) => {
            events.push(`discover:${folderUris.join(",")}`);
            return folderUris.map((uri) => `${uri}/document.jq`);
        });
        const workspace = new WorkspaceService(index, discoverWorkspaceDocumentUris);

        void workspace.setWorkspaceFolders(["file:///workspace"]);
        await workspace.updateWatchedFiles([
            { uri: "file:///workspace/changed.jq", type: FileChangeType.Changed },
        ]);

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
        const workspace = new WorkspaceService(new WorkspaceIndex(), discoverWorkspaceDocumentUris);

        void workspace.setWorkspaceFolders(["file:///first"]);
        await workspace.updateWorkspaceFolders(["file:///second"], ["file:///first"]);

        expect(events).toContain("discover:file:///second");
    });

    it("continues processing after a failed operation", async () => {
        const events: string[] = [];
        const index = new WorkspaceIndex();
        vi.spyOn(index, "updateWorkspaceDocuments").mockImplementation((changes) => {
            events.push(`update:${changes.map((change) => change.uri).join(",")}`);
        });
        const error = new Error("discovery failed");
        discoverWorkspaceDocumentUris.mockRejectedValue(error);
        const workspace = new WorkspaceService(index, discoverWorkspaceDocumentUris);

        void workspace.setWorkspaceFolders(["file:///workspace"]);
        await workspace.updateWatchedFiles([
            { uri: "file:///workspace/changed.jq", type: FileChangeType.Changed },
        ]);

        expect(logger.error).toHaveBeenCalledWith("Workspace indexing failed.", error);
        expect(events).toEqual(["update:file:///workspace/changed.jq"]);
    });
});
