import { RumbleWrapperClient } from "server/integrations/rumble/client.js";
import type { TypeAtPositionRequestSpec } from "server/integrations/rumble/operations/type-at-position/protocol.js";
import { describe, expect, it, vi } from "vitest";
import { CancellationTokenSource } from "vscode-languageserver";

describe("wrapper client surface", () => {
    it("can be instantiated", () => {
        const client = new RumbleWrapperClient();
        expect(client).toBeDefined();
    });

    it("is configured enabled by default", () => {
        const client = new RumbleWrapperClient();
        expect(client.isConfiguredEnabled()).toBe(true);
    });

    it("is usable by default", () => {
        const client = new RumbleWrapperClient();
        expect(client.isUsable()).toBe(true);
    });

    it("starts with unknown rumble version", () => {
        const client = new RumbleWrapperClient();
        expect(client.getRumbleVersion()).toBeNull();
        expect(client.getRumbleCommit()).toBeNull();
        expect(client.getRumbleCommitShort()).toBeNull();
    });

    it("dispose can be called safely", () => {
        const client = new RumbleWrapperClient();
        expect(() => client.dispose()).not.toThrow();
    });

    it("restart disposes and reconnects the wrapper", async () => {
        const client = new RumbleWrapperClient();
        const dispose = vi.spyOn(client, "dispose");
        const connect = vi.spyOn(client, "connect").mockResolvedValue();

        await client.restart();

        expect(dispose).toHaveBeenCalledOnce();
        expect(connect).toHaveBeenCalledOnce();
        expect(dispose.mock.invocationCallOrder[0]).toBeLessThan(
            connect.mock.invocationCallOrder[0],
        );
    });

    it("after connect, rumble version is set", async () => {
        const client = new RumbleWrapperClient();
        if (client.isUsable()) {
            await expect(client.connect()).resolves.toBeUndefined();
            expect(client.getRumbleVersion()).toBeDefined();
            expect(client.getRumbleCommit()).toBeDefined();
            expect(client.getRumbleCommitShort()).toBeDefined();
        }
    }, 30_000);

    describe("cancellation", () => {
        const request: TypeAtPositionRequestSpec["request"] = {
            requestType: "type-at-position",
            body: Buffer.from("1 + 1", "utf8").toString("base64"),
            documentUri: "file:///cancellation.jq",
            position: { line: 0, character: 0 },
        };

        /** Lets a request reach RumbleDB, after the client checks its connection. */
        const afterSending = () => new Promise((resolve) => setImmediate(resolve));

        it("rejects without sending when the token is already cancelled", async () => {
            const client = new RumbleWrapperClient();
            await client.connect();
            const cancellation = new CancellationTokenSource();
            cancellation.cancel();

            await expect(
                client.sendRequest<TypeAtPositionRequestSpec>(request, {
                    token: cancellation.token,
                }),
            ).rejects.toThrow("Operation was cancelled.");
            client.dispose();
        }, 30_000);

        it("rejects a request cancelled mid-flight and keeps RumbleDB running", async () => {
            const client = new RumbleWrapperClient();
            await client.connect();
            const dispose = vi.spyOn(client, "dispose");
            const cancellation = new CancellationTokenSource();

            const cancelled = client.sendRequest<TypeAtPositionRequestSpec>(request, {
                token: cancellation.token,
            });
            await afterSending();
            cancellation.cancel();

            await expect(cancelled).rejects.toThrow("Operation was cancelled.");
            expect(dispose).not.toHaveBeenCalled();
            // RumbleDB still answers the cancelled request; the next one gets its own answer.
            await expect(
                client.sendRequest<TypeAtPositionRequestSpec>(request),
            ).resolves.toMatchObject({ responseType: "type-at-position" });
            client.dispose();
        }, 30_000);

        it("restarts RumbleDB when asked to on cancellation", async () => {
            const client = new RumbleWrapperClient();
            await client.connect();
            const dispose = vi.spyOn(client, "dispose");
            const cancellation = new CancellationTokenSource();

            const cancelled = client.sendRequest<TypeAtPositionRequestSpec>(request, {
                token: cancellation.token,
                restartOnCancel: true,
            });
            await afterSending();
            cancellation.cancel();

            await expect(cancelled).rejects.toThrow("Operation was cancelled.");
            expect(dispose).toHaveBeenCalledOnce();
            client.dispose();
        }, 30_000);
    });
});
