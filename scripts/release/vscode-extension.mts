import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { ensureRelease, releaseTag, uploadReleaseAsset } from "./github.mts";
import {
    findOneFile,
    LANGUAGE_SERVER_PACKAGE_DIR,
    output,
    readChangelogEntry,
    readPackage,
    run,
    VSCODE_EXTENSION_PACKAGE_DIR,
    type PackageJson,
} from "./shared.mts";

function vsceArgs(command: "package" | "publish"): string[] {
    return [
        "dlx",
        "--allow-build=@vscode/vsce-sign",
        "--allow-build=keytar",
        "@vscode/vsce",
        command,
    ];
}

function ovsxArgs(command: "publish"): string[] {
    return ["dlx", "--allow-build=@vscode/vsce-sign", "--allow-build=keytar", "ovsx", command];
}

export function cleanVsCodeExtensionInstall(): void {
    /// vsce expects npm's node_modules layout, so package from a clean npm install.
    run("rm", [
        "-rf",
        `${VSCODE_EXTENSION_PACKAGE_DIR}/node_modules`,
        `${VSCODE_EXTENSION_PACKAGE_DIR}/package-lock.json`,
    ]);
}

function materializeVsCodeExtensionManifestForNpm(): void {
    const packDir = fs.mkdtempSync(path.join(os.tmpdir(), "jsoniq-vscode-pack-"));

    try {
        run("pnpm", ["pack", "--pack-destination", packDir], {
            cwd: VSCODE_EXTENSION_PACKAGE_DIR,
        });

        const packagePath = findOneFile(packDir, ".tgz");
        const packageJson = output("tar", ["-xOf", packagePath, "package/package.json"]);

        fs.writeFileSync(
            path.join(VSCODE_EXTENSION_PACKAGE_DIR, "package.json"),
            `${packageJson}\n`,
            "utf8",
        );
    } finally {
        fs.rmSync(packDir, { recursive: true, force: true });
    }
}

export function setVsCodeExtensionLanguageServerDependency(versionSpec: string): void {
    const languageServerPackage = readPackage(LANGUAGE_SERVER_PACKAGE_DIR);
    run("npm", ["pkg", "set", `dependencies.${languageServerPackage.name}=${versionSpec}`], {
        cwd: VSCODE_EXTENSION_PACKAGE_DIR,
    });
}

export function installAndBuildVsCodeExtension(): void {
    /// npm cannot resolve pnpm's catalog: or workspace: protocols. pnpm pack creates the
    /// publishable manifest that replaces them with regular dependency versions.
    materializeVsCodeExtensionManifestForNpm();
    run("npm", ["install"], { cwd: VSCODE_EXTENSION_PACKAGE_DIR });
    run("npm", ["run", "build:prod"], { cwd: VSCODE_EXTENSION_PACKAGE_DIR });
}

export function packVsCodeExtension(preRelease: boolean): string {
    const args = [...vsceArgs("package")];

    if (preRelease) {
        args.push("--pre-release");
    }

    run("pnpm", args, { cwd: VSCODE_EXTENSION_PACKAGE_DIR });

    return findOneFile(VSCODE_EXTENSION_PACKAGE_DIR, ".vsix");
}

function publishVsCodeExtensionToMarketplace(vsixPath: string): void {
    run("pnpm", [...vsceArgs("publish"), "--oidc", "--packagePath", vsixPath], {
        cwd: VSCODE_EXTENSION_PACKAGE_DIR,
    });
}

function publishVsCodeExtensionToOpenVsx(vsixPath: string): void {
    run("pnpm", [...ovsxArgs("publish"), vsixPath, "--trusted-publishing"], {
        cwd: VSCODE_EXTENSION_PACKAGE_DIR,
    });
}

export async function publishVsCodeExtension(
    extensionPackage: PackageJson,
    languageServerPackagePath?: string,
): Promise<void> {
    const languageServerPackage = readPackage(LANGUAGE_SERVER_PACKAGE_DIR);
    const languageServerDependency =
        languageServerPackagePath === undefined
            ? languageServerPackage.version
            : `file:${languageServerPackagePath}`;

    cleanVsCodeExtensionInstall();
    setVsCodeExtensionLanguageServerDependency(languageServerDependency);
    installAndBuildVsCodeExtension();

    const vsixPath = packVsCodeExtension(false);

    const tag = releaseTag(extensionPackage);
    const release = await ensureRelease(tag, tag, {
        body: readChangelogEntry(VSCODE_EXTENSION_PACKAGE_DIR, extensionPackage.version),
    });

    await uploadReleaseAsset(release, vsixPath);
    publishVsCodeExtensionToMarketplace(vsixPath);
    publishVsCodeExtensionToOpenVsx(vsixPath);
}
