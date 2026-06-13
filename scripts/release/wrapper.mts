import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";

import {
    downloadReleaseAssetText,
    ensureRelease,
    getRelease,
    releaseTag,
    uploadReleaseAsset,
    type Release,
    type ReleaseAsset,
} from "./github.mts";
import {
    findOneFile,
    PACKAGE_ROOT,
    readChangelogEntry,
    RELEASE_OUTPUT_DIR,
    run,
    WRAPPER_PACKAGE_DIR,
    type PackageJson,
} from "./shared.mts";

const WRAPPER_TARGET_DIR = `${PACKAGE_ROOT}/packages/rumble-lsp-wrapper/target`;
const WRAPPER_MANIFEST_ASSET_NAME = "rumble-lsp-wrapper-release-manifest.json";

export interface WrapperReleaseManifest {
    tag: string;
    releaseName: string;
    releaseUrl: string;
    assetName: string;
    jarUrl: string;
    jarSha256: string;
    jarSizeBytes: number;
    wrapperVersion: string;
    createdAt: string;
    commitSha?: string;
}

function sha256(file: string): string {
    return crypto.createHash("sha256").update(fs.readFileSync(file)).digest("hex");
}

function wrapperJarAssetName(version: string): string {
    return `rumble-lsp-wrapper-${version}-all.jar`;
}

function findAssetByName(release: Release, name: string): ReleaseAsset | undefined {
    return release.assets.find((asset) => asset.name === name);
}

async function readWrapperReleaseManifestAsset(
    release: Release,
): Promise<WrapperReleaseManifest | undefined> {
    const manifestAsset = findAssetByName(release, WRAPPER_MANIFEST_ASSET_NAME);
    if (manifestAsset === undefined) {
        return undefined;
    }

    return JSON.parse(await downloadReleaseAssetText(manifestAsset)) as WrapperReleaseManifest;
}

export function buildWrapperProductionArtifacts(): void {
    run("pnpm", ["--filter", "rumble-lsp-wrapper", "run", "build:prod"]);
}

export async function attachWrapperArtifacts(
    wrapperPackage: PackageJson,
    release: Release,
): Promise<WrapperReleaseManifest> {
    const jarPath = findOneFile(WRAPPER_TARGET_DIR, `-${wrapperPackage.version}-all.jar`);
    const jarSha256 = sha256(jarPath);
    const jarSizeBytes = fs.statSync(jarPath).size;
    const jarAsset = await uploadReleaseAsset(release, jarPath);

    const manifest: WrapperReleaseManifest = {
        tag: release.tag_name,
        releaseName: release.name ?? release.tag_name,
        releaseUrl: release.html_url,
        assetName: jarAsset.name,
        jarUrl: jarAsset.browser_download_url,
        jarSha256,
        jarSizeBytes,
        wrapperVersion: wrapperPackage.version,
        createdAt: new Date().toISOString(),
        commitSha: process.env.GITHUB_SHA,
    };

    const manifestPath = path.join(RELEASE_OUTPUT_DIR, WRAPPER_MANIFEST_ASSET_NAME);
    fs.writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 4)}\n`, "utf8");
    await uploadReleaseAsset(release, manifestPath);

    return manifest;
}

export async function publishWrapper(wrapperPackage: PackageJson): Promise<WrapperReleaseManifest> {
    const tag = releaseTag(wrapperPackage);
    const release = await ensureRelease(tag, tag, {
        body: readChangelogEntry(WRAPPER_PACKAGE_DIR, wrapperPackage.version),
    });

    return await attachWrapperArtifacts(wrapperPackage, release);
}

export async function getExistingWrapperReleaseManifest(
    wrapperPackage: PackageJson,
): Promise<WrapperReleaseManifest | null> {
    const release = await getRelease(releaseTag(wrapperPackage));
    if (release === null) {
        return null;
    }

    const manifest = await readWrapperReleaseManifestAsset(release);
    const jarAsset = findAssetByName(release, wrapperJarAssetName(wrapperPackage.version));

    if (manifest === undefined || jarAsset === undefined) {
        return null;
    }

    return manifest;
}

export function ensureLocalWrapper(wrapperPackage: PackageJson): void {
    const classpathPath = path.join(WRAPPER_TARGET_DIR, "runtime-classpath.txt");
    try {
        findOneFile(WRAPPER_TARGET_DIR, `-${wrapperPackage.version}-all.jar`);
        if (fs.existsSync(classpathPath)) {
            console.log("Local wrapper target artifacts already exist. Skipping build.");
            return;
        }
    } catch {
        // Target artifacts not found, proceed to build
    }

    buildWrapperProductionArtifacts();
}

export async function ensureWrapperRelease(
    wrapperPackage: PackageJson,
): Promise<WrapperReleaseManifest> {
    const manifest = await getExistingWrapperReleaseManifest(wrapperPackage);
    if (manifest !== null) {
        return manifest;
    }

    ensureLocalWrapper(wrapperPackage);
    return await publishWrapper(wrapperPackage);
}
