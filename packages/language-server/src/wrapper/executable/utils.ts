import { createHash } from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const LANGUAGE_SERVER_CACHE_DIRNAME = "jsoniq-language-server";
const WRAPPER_CACHE_SUBDIRECTORY = "wrapper";

export function computeFileSha256(filePath: string): string {
    const fileContent = fs.readFileSync(filePath);
    return createHash("sha256").update(fileContent).digest("hex");
}

export function getBaseCacheDirectory(
    env: NodeJS.ProcessEnv = process.env,
    platform: NodeJS.Platform = process.platform,
): string {
    const xdgCacheHome = env.XDG_CACHE_HOME;
    if (xdgCacheHome !== undefined && xdgCacheHome.length > 0) {
        return xdgCacheHome;
    }

    if (platform === "darwin") {
        return path.join(os.homedir(), "Library", "Caches");
    }

    if (platform === "win32") {
        const localAppData = env.LOCALAPPDATA;
        if (localAppData !== undefined && localAppData.length > 0) {
            return localAppData;
        }

        return path.join(os.homedir(), "AppData", "Local");
    }

    return path.join(os.homedir(), ".cache");
}

export function getWrapperCacheDirectory(
    env: NodeJS.ProcessEnv = process.env,
    platform: NodeJS.Platform = process.platform,
): string {
    const explicitCacheDir = env.JSONIQ_LSP_CACHE_DIR;
    if (explicitCacheDir !== undefined && explicitCacheDir.length > 0) {
        return path.join(explicitCacheDir, WRAPPER_CACHE_SUBDIRECTORY);
    }

    return path.join(
        getBaseCacheDirectory(env, platform),
        LANGUAGE_SERVER_CACHE_DIRNAME,
        WRAPPER_CACHE_SUBDIRECTORY,
    );
}

export const SPARK_JVM_ARGS: readonly string[] = [
    "--add-opens=java.base/java.lang=ALL-UNNAMED",
    "--add-opens=java.base/java.lang.invoke=ALL-UNNAMED",
    "--add-opens=java.base/java.lang.reflect=ALL-UNNAMED",
    "--add-opens=java.base/java.io=ALL-UNNAMED",
    "--add-opens=java.base/java.net=ALL-UNNAMED",
    "--add-opens=java.base/java.nio=ALL-UNNAMED",
    "--add-opens=java.base/java.util=ALL-UNNAMED",
    "--add-opens=java.base/java.util.concurrent=ALL-UNNAMED",
    "--add-opens=java.base/java.util.concurrent.atomic=ALL-UNNAMED",
    "--add-opens=java.base/sun.nio.ch=ALL-UNNAMED",
    "--add-opens=java.base/sun.nio.cs=ALL-UNNAMED",
    "--add-opens=java.base/sun.security.action=ALL-UNNAMED",
    "--add-opens=java.base/sun.util.calendar=ALL-UNNAMED",
    "--add-opens=java.security.jgss/sun.security.krb5=ALL-UNNAMED",
];
