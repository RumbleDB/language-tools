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
