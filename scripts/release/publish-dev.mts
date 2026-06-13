import { ensureRelease, uploadReleaseAsset } from "./github.mts";
import {
    attachLanguageServerArtifacts,
    buildLanguageServerProductionArtifacts,
} from "./language-server.mts";
import {
    LANGUAGE_SERVER_PACKAGE_DIR,
    output,
    prepareOutputDir,
    readPackage,
    run,
    VSCODE_EXTENSION_PACKAGE_DIR,
    WRAPPER_PACKAGE_DIR,
} from "./shared.mts";
import {
    cleanVsCodeExtensionInstall,
    installAndBuildVsCodeExtension,
    packVsCodeExtension,
    setVsCodeExtensionLanguageServerDependency,
} from "./vscode-extension.mts";
import { attachWrapperArtifacts, ensureLocalWrapper } from "./wrapper.mts";

function shortSha(): string {
    let sha = process.env.GITHUB_SHA;
    if (sha === undefined || sha.length === 0) {
        sha = output("git", ["rev-parse", "HEAD"]);
    }

    return sha.slice(0, 7);
}

function humanDate(): string {
    return new Date().toISOString().slice(0, 10);
}

async function main(): Promise<void> {
    prepareOutputDir();

    const buildId = shortSha();
    const tag = `snapshot/${buildId}`;
    const release = await ensureRelease(tag, `Snapshot ${humanDate()} ${buildId}`, {
        prerelease: true,
    });

    const wrapperPackage = readPackage(WRAPPER_PACKAGE_DIR);
    ensureLocalWrapper(wrapperPackage);
    const wrapperManifest = await attachWrapperArtifacts(wrapperPackage, release);
    buildLanguageServerProductionArtifacts();
    const languageServerPackagePath = await attachLanguageServerArtifacts(release, wrapperManifest);

    const extensionPackage = readPackage(VSCODE_EXTENSION_PACKAGE_DIR);
    const languageServerPackage = readPackage(LANGUAGE_SERVER_PACKAGE_DIR);
    const extensionVersion = `${extensionPackage.version}-snapshot.git-${buildId}`;
    const languageServerFileSpec = `file:${languageServerPackagePath}`;

    cleanVsCodeExtensionInstall();
    run("pnpm", ["version", extensionVersion, "--no-git-tag-version", "--no-git-checks"], {
        cwd: VSCODE_EXTENSION_PACKAGE_DIR,
    });
    setVsCodeExtensionLanguageServerDependency(languageServerFileSpec);
    installAndBuildVsCodeExtension();

    run(
        "sh",
        [
            "-c",
            `test -f "node_modules/${languageServerPackage.name}/package.json" && test -f "node_modules/${languageServerPackage.name}/dist/main.mjs" && test -f "node_modules/vscode-languageclient/package.json"`,
        ],
        { cwd: VSCODE_EXTENSION_PACKAGE_DIR },
    );

    const vsixPath = packVsCodeExtension(true);
    await uploadReleaseAsset(release, vsixPath);
}

await main();
