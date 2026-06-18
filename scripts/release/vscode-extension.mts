import { ensureRelease, releaseTag, uploadReleaseAsset } from "./github.mts";
import {
    findOneFile,
    LANGUAGE_SERVER_PACKAGE_DIR,
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

export function cleanVsCodeExtensionInstall(): void {
    /// vsce does not support pnpm's node_modules layout, so package from a clean npm install.
    run("rm", [
        "-rf",
        `${VSCODE_EXTENSION_PACKAGE_DIR}/node_modules`,
        `${VSCODE_EXTENSION_PACKAGE_DIR}/package-lock.json`,
    ]);
}

export function setVsCodeExtensionLanguageServerDependency(versionSpec: string): void {
    const languageServerPackage = readPackage(LANGUAGE_SERVER_PACKAGE_DIR);
    run("npm", ["pkg", "set", `dependencies.${languageServerPackage.name}=${versionSpec}`], {
        cwd: VSCODE_EXTENSION_PACKAGE_DIR,
    });
}

export function installAndBuildVsCodeExtension(): void {
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
    if (process.env.VSCE_PAT === undefined || process.env.VSCE_PAT.length === 0) {
        throw new Error("VSCE_PAT is required to publish the VS Code extension.");
    }

    run("pnpm", [...vsceArgs("publish"), "--packagePath", vsixPath], {
        cwd: VSCODE_EXTENSION_PACKAGE_DIR,
        env: process.env,
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
}
