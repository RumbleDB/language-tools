import { RumbleWrapperClient } from "server/integrations/rumble/client.js";
import { describe, expect, it, vi } from "vitest";

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
});
