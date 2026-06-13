import fs from "node:fs";
import path from "node:path";

import { ensureRelease, releaseTag, uploadReleaseAsset, type Release } from "./github.mts";
import {
    findOneFile,
    LANGUAGE_SERVER_PACKAGE_DIR,
    RELEASE_OUTPUT_DIR,
    readChangelogEntry,
    run,
    type PackageJson,
    WRAPPER_PACKAGE_DIR,
    readPackage,
} from "./shared.mts";
import { ensureLocalWrapper, type WrapperReleaseManifest } from "./wrapper.mts";
const MANIFEST_PATH = `${LANGUAGE_SERVER_PACKAGE_DIR}/assets/wrapper/release-manifest.json`;

export function buildLanguageServerProductionArtifacts(): void {
    const wrapperPackage = readPackage(WRAPPER_PACKAGE_DIR);
    ensureLocalWrapper(wrapperPackage);

    run("pnpm", ["run", "generate:grammar"]);
    run("pnpm", ["run", "build:server:prod"]);
}

function writeWrapperManifest(manifest: WrapperReleaseManifest): void {
    fs.mkdirSync(path.dirname(MANIFEST_PATH), { recursive: true });
    fs.writeFileSync(MANIFEST_PATH, `${JSON.stringify(manifest, null, 4)}\n`, "utf8");
}

export async function attachLanguageServerArtifacts(
    release: Release,
    wrapperManifest: WrapperReleaseManifest,
): Promise<string> {
    writeWrapperManifest(wrapperManifest);
    run("pnpm", [
        "--dir",
        LANGUAGE_SERVER_PACKAGE_DIR,
        "pack",
        "--pack-destination",
        RELEASE_OUTPUT_DIR,
    ]);

    const packagePath = findOneFile(RELEASE_OUTPUT_DIR, ".tgz");
    await uploadReleaseAsset(release, packagePath);

    return packagePath;
}

export async function publishLanguageServer(
    languageServerPackage: PackageJson,
    wrapperManifest: WrapperReleaseManifest,
): Promise<string> {
    buildLanguageServerProductionArtifacts();

    const tag = releaseTag(languageServerPackage);
    const release = await ensureRelease(tag, tag, {
        body: readChangelogEntry(LANGUAGE_SERVER_PACKAGE_DIR, languageServerPackage.version),
    });
    const packagePath = await attachLanguageServerArtifacts(release, wrapperManifest);

    run("pnpm", ["publish", "--access", "public", "--no-git-checks"], {
        cwd: LANGUAGE_SERVER_PACKAGE_DIR,
    });

    return packagePath;
}
