import os from "node:os";
import path from "node:path";

import {
    getBaseCacheDirectory,
    getWrapperCacheDirectory,
} from "server/integrations/rumble/executable/utils";
import { describe, expect, it } from "vitest";

describe("wrapper executable cache directories", () => {
    it("uses JSONIQ_LSP_CACHE_DIR when explicitly provided", () => {
        expect(
            getWrapperCacheDirectory({
                JSONIQ_LSP_CACHE_DIR: "/tmp/jsoniq-cache",
            }),
        ).toBe(path.join("/tmp/jsoniq-cache", "wrapper"));
    });

    it("uses XDG_CACHE_HOME when available", () => {
        expect(
            getWrapperCacheDirectory({
                XDG_CACHE_HOME: "/tmp/xdg-cache",
            }),
        ).toBe(path.join("/tmp/xdg-cache", "jsoniq-language-server", "wrapper"));
    });

    it("uses LOCALAPPDATA on Windows", () => {
        expect(
            getBaseCacheDirectory(
                {
                    LOCALAPPDATA: "C:\\Users\\test\\AppData\\Local",
                },
                "win32",
            ),
        ).toBe("C:\\Users\\test\\AppData\\Local");
    });

    it("uses the platform default cache location when no overrides are set", () => {
        expect(getBaseCacheDirectory({}, "darwin")).toBe(
            path.join(os.homedir(), "Library", "Caches"),
        );
        expect(getBaseCacheDirectory({}, "linux")).toBe(path.join(os.homedir(), ".cache"));
    });
});
