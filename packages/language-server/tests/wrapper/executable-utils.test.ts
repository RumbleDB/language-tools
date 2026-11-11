import os from "node:os";
import path from "node:path";

import {
    getBaseCacheDirectory,
    getWrapperCacheDirectory,
    sparkConfToJvmArgs,
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

describe("sparkConfToJvmArgs", () => {
    it("turns spark properties into system properties", () => {
        expect(
            sparkConfToJvmArgs({
                "spark.sql.extensions": "io.delta.sql.DeltaSparkSessionExtension",
                "spark.executor.cores": 2,
                "spark.sql.adaptive.enabled": false,
            }),
        ).toEqual([
            "-Dspark.sql.extensions=io.delta.sql.DeltaSparkSessionExtension",
            "-Dspark.executor.cores=2",
            "-Dspark.sql.adaptive.enabled=false",
        ]);
    });

    it("drops keys outside spark. and non-scalar values", () => {
        const ignored: string[] = [];
        expect(
            sparkConfToJvmArgs({ "java.io.tmpdir": "/tmp", "spark.foo": { nested: true } }, (key) =>
                ignored.push(key),
            ),
        ).toEqual([]);
        expect(ignored).toEqual(["java.io.tmpdir", "spark.foo"]);
    });

    it("returns nothing when unset", () => {
        expect(sparkConfToJvmArgs()).toEqual([]);
    });
});
