import { WorkspaceController } from "server/workspace/controller.js";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { FileChangeType, type FileEvent } from "vscode-languageserver/node";

const workspaceService = vi.hoisted(() => ({
    replaceWorkspaceDocuments: vi.fn<(uris: readonly string[]) => ReadonlySet<string>>(),
    updateWorkspaceDocuments: vi.fn<(changes: readonly FileEvent[]) => ReadonlySet<string>>(),
}));
const discoverWorkspaceDocumentUris = vi.hoisted(() =>
    vi.fn<(folderUris: readonly string[]) => Promise<readonly string[]>>(),
);
const logger = vi.hoisted(() => ({ error: vi.fn() }));

vi.mock("server/workspace/service.js", () => workspaceService);
vi.mock("server/workspace/files.js", () => ({ discoverWorkspaceDocumentUris }));
vi.mock("server/utils/logger.js", () => ({ createLogger: () => logger }));

beforeEach(() => {
    vi.resetAllMocks();
});

describe("workspace controller", () => {
    it("serializes discovery and document changes", async () => {
        const events: string[] = [];
        workspaceService.replaceWorkspaceDocuments.mockImplementation((uris) => {
            events.push(`replace:${uris.join(",")}`);
            return new Set(uris);
        });
        workspaceService.updateWorkspaceDocuments.mockImplementation((changes) => {
            events.push(`update:${changes.map((change) => change.uri).join(",")}`);
            return new Set(changes.map((change) => change.uri));
        });
        discoverWorkspaceDocumentUris.mockImplementation(async (folderUris) => {
            events.push(`discover:${folderUris.join(",")}`);
            return folderUris.map((uri) => `${uri}/document.jq`);
        });
        const controller = new WorkspaceController();

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
        const controller = new WorkspaceController();

        controller.initialize(["file:///first"]);
        controller.updateFolders(["file:///second"], ["file:///first"]);
        await controller.ready();

        expect(events).toContain("discover:file:///second");
    });

    it("continues processing after a failed operation", async () => {
        const events: string[] = [];
        workspaceService.updateWorkspaceDocuments.mockImplementation((changes) => {
            events.push(`update:${changes.map((change) => change.uri).join(",")}`);
            return new Set(changes.map((change) => change.uri));
        });
        const error = new Error("discovery failed");
        discoverWorkspaceDocumentUris.mockRejectedValue(error);
        const controller = new WorkspaceController();

        controller.initialize(["file:///workspace"]);
        controller.updateDocuments([
            { uri: "file:///workspace/changed.jq", type: FileChangeType.Changed },
        ]);
        await controller.ready();

        expect(logger.error).toHaveBeenCalledWith("Workspace indexing failed.", error);
        expect(events).toEqual(["update:file:///workspace/changed.jq"]);
    });

    it("refreshes affected documents after each queued workspace operation", async () => {
        workspaceService.replaceWorkspaceDocuments.mockReturnValue(
            new Set(["file:///workspace/importer.jq"]),
        );
        workspaceService.updateWorkspaceDocuments.mockReturnValue(
            new Set(["file:///workspace/importer.jq", "file:///workspace/library.jq"]),
        );
        discoverWorkspaceDocumentUris.mockResolvedValue(["file:///workspace/importer.jq"]);
        const refreshed: string[][] = [];
        const controller = new WorkspaceController((affected) => {
            refreshed.push([...affected]);
        });

        controller.initialize(["file:///workspace"]);
        controller.updateDocuments([
            { uri: "file:///workspace/library.jq", type: FileChangeType.Changed },
        ]);
        await controller.ready();

        expect(refreshed).toEqual([
            ["file:///workspace/importer.jq"],
            ["file:///workspace/importer.jq", "file:///workspace/library.jq"],
        ]);
    });

    it("does not block workspace readiness on document refreshes", async () => {
        workspaceService.replaceWorkspaceDocuments.mockReturnValue(
            new Set(["file:///workspace/importer.jq"]),
        );
        discoverWorkspaceDocumentUris.mockResolvedValue(["file:///workspace/importer.jq"]);
        let finishRefresh!: () => void;
        const refreshPending = new Promise<void>((resolve) => {
            finishRefresh = resolve;
        });
        const controller = new WorkspaceController(() => refreshPending);
        let ready = false;

        controller.initialize(["file:///workspace"]);
        void controller.ready().then(() => {
            ready = true;
        });
        await new Promise<void>((resolve) => setImmediate(resolve));

        expect(ready).toBe(true);
        finishRefresh();
        await refreshPending;
    });
});
