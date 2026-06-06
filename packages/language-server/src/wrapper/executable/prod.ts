import fs from "node:fs";
import path from "node:path";

import { findPackageRoot } from "server/utils/assets.js";
import { createLogger } from "server/utils/logger.js";

import { createTerminalProgressReporter, downloadWithProgress } from "./download.js";
import { type WrapperLaunchConfig, type WrapperResolutionOptions } from "./index.js";
import { computeFileSha256, getWrapperCacheDirectory } from "./utils.js";

/// Production environment: use package assets instead of compiled output.
const PACKAGE_ROOT = findPackageRoot();
const WRAPPER_JAR_ASSET_FOLDER = path.join(PACKAGE_ROOT, "assets/wrapper");
const WRAPPER_RELEASE_MANIFEST_FILE = "release-manifest.json";
const WRAPPER_REMOTE_JAR_FILE = "rumble-lsp-wrapper.remote.jar";
const WRAPPER_REMOTE_JAR_TEMP_FILE = `${WRAPPER_REMOTE_JAR_FILE}.download`;

interface WrapperReleaseManifest {
    jarUrl: string;
    jarSha256: string;
    jarSizeBytes: number;
}

function readReleaseManifest(): WrapperReleaseManifest {
    const manifestPath = path.join(WRAPPER_JAR_ASSET_FOLDER, WRAPPER_RELEASE_MANIFEST_FILE);
    if (!fs.existsSync(manifestPath)) {
        throw new Error(`Wrapper release manifest not found: '${manifestPath}'.`);
    }
    const manifestRaw = fs.readFileSync(manifestPath, "utf8");
    const manifest = JSON.parse(manifestRaw) as WrapperReleaseManifest;

    if (!Number.isFinite(manifest.jarSizeBytes) || manifest.jarSizeBytes <= 0) {
        throw new Error(
            `Wrapper release manifest contains invalid jarSizeBytes: '${manifest.jarSizeBytes}'.`,
        );
    }

    return manifest;
}

const logger = createLogger("wrapper:jar-resolution/production");

export async function resolveProductionJarPath(
    options: WrapperResolutionOptions = {},
): Promise<string> {
    const manifest = readReleaseManifest();
    const wrapperCacheDirectory = getWrapperCacheDirectory();
    const cachedJarPath = path.join(wrapperCacheDirectory, WRAPPER_REMOTE_JAR_FILE);

    if (fs.existsSync(cachedJarPath) && computeFileSha256(cachedJarPath) === manifest.jarSha256) {
        options.onProgress?.({
            stage: "verified",
            downloadedBytes: manifest.jarSizeBytes,
            totalBytes: manifest.jarSizeBytes,
        });
        return cachedJarPath;
    }

    logger.info(`Downloading wrapper jar from '${manifest.jarUrl}'.`);
    fs.mkdirSync(wrapperCacheDirectory, { recursive: true });

    const tempJarPath = path.join(wrapperCacheDirectory, WRAPPER_REMOTE_JAR_TEMP_FILE);
    const progressReporter = options.onProgress ?? createTerminalProgressReporter();

    try {
        const downloadedJar = await downloadWithProgress(
            manifest.jarUrl,
            tempJarPath,
            manifest.jarSizeBytes,
            progressReporter,
        );
        if (downloadedJar.sizeBytes !== manifest.jarSizeBytes) {
            throw new Error(
                `Downloaded wrapper jar size mismatch: expected ${manifest.jarSizeBytes} bytes, got ${downloadedJar.sizeBytes} bytes.`,
            );
        }

        if (
            manifest.jarSha256 !== undefined &&
            manifest.jarSha256.length > 0 &&
            downloadedJar.sha256 !== manifest.jarSha256
        ) {
            throw new Error(
                `Downloaded wrapper jar hash mismatch: expected '${manifest.jarSha256}', got '${downloadedJar.sha256}'.`,
            );
        }

        fs.renameSync(tempJarPath, cachedJarPath);
        progressReporter?.({
            stage: "verified",
            downloadedBytes: manifest.jarSizeBytes,
            totalBytes: manifest.jarSizeBytes,
        });
    } catch (error) {
        progressReporter?.({
            stage: "download-failed",
            downloadedBytes: 0,
            totalBytes: manifest.jarSizeBytes,
            message: error instanceof Error ? error.message : String(error),
        });
        fs.rmSync(tempJarPath, { force: true });
        throw error;
    }

    return cachedJarPath;
}

export async function resolveProdLaunchConfig(
    options: WrapperResolutionOptions = {},
): Promise<WrapperLaunchConfig> {
    const cachedJarPath = await resolveProductionJarPath(options);
    return {
        args: ["-jar", cachedJarPath, "--daemon"],
    };
}
