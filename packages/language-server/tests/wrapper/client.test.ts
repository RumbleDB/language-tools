import { getWrapperClient } from "server/wrapper/client";
import { describe, expect, it } from "vitest";

describe("wrapper client surface", () => {
    it("exports a singleton wrapper client", () => {
        expect(getWrapperClient()).toBeDefined();
    });

    it("starts with unknown rumble version", () => {
        expect(getWrapperClient().getRumbleVersion()).toBeNull();
        expect(getWrapperClient().getRumbleCommit()).toBeNull();
        expect(getWrapperClient().getRumbleCommitShort()).toBeNull();
    });

    it("dispose can be called safely", () => {
        expect(() => getWrapperClient().dispose()).not.toThrow();
    });

    it("after connect, rumble version is set", async () => {
        const client = getWrapperClient();
        if (client.isEnabled()) {
            await expect(client.connect()).resolves.toBeUndefined();
            expect(client.getRumbleVersion()).toBeDefined();
            expect(client.getRumbleCommit()).toBeDefined();
            expect(client.getRumbleCommitShort()).toBeDefined();
        }
    }, 30_000);
});
