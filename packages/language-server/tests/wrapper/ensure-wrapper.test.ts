import { fileURLToPath } from "node:url";

import { ensureWrapper } from "server/integrations/rumble/executable/index.js";
import { afterEach, describe, expect, it, vi } from "vitest";

describe("ensure wrapper", () => {
    afterEach(() => {
        vi.unstubAllEnvs();
        vi.restoreAllMocks();
        process.exitCode = undefined;
    });

    it("prints the command that starts the wrapper", async () => {
        const jarPath = fileURLToPath(import.meta.url);
        vi.stubEnv("JSONIQ_LSP_WRAPPER_JAR", jarPath);
        const log = vi.spyOn(console, "log").mockImplementation(() => {});

        await ensureWrapper();

        const command: string = log.mock.calls[0]?.[0];
        expect(command).toMatch(/^java /);
        expect(command).toContain(`-jar ${jarPath} --daemon`);
        expect(process.exitCode).toBeUndefined();
    });

    it("exits with code 1 when the wrapper cannot be resolved", async () => {
        vi.stubEnv("JSONIQ_LSP_WRAPPER_JAR", "/missing/wrapper.jar");
        const error = vi.spyOn(console, "error").mockImplementation(() => {});

        await ensureWrapper();

        expect(error).toHaveBeenCalledWith(expect.stringContaining("/missing/wrapper.jar"));
        expect(process.exitCode).toBe(1);
    });
});
