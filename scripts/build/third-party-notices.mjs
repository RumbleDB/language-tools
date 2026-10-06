import fs from "node:fs";
import path from "node:path";

const LICENSE_FILE = /^(licen[cs]e|copying|notice)([.-].*)?$/i;

/**
 * Emits the licence texts of every node_modules package inlined into the bundle, since MIT and BSD
 * licences require their notices to accompany redistributed copies.
 * `extraPackages` names packages whose content reaches the bundle without a module import, e.g. icon data.
 * `licenseFiles` maps a package name to a licence file for packages that do not ship one.
 *
 * @param {{ fileName?: string; extraPackages?: string[]; licenseFiles?: Record<string, string> }} [options]
 */
export function thirdPartyNotices({
    fileName = "THIRD-PARTY-NOTICES.txt",
    extraPackages = [],
    licenseFiles = {},
} = {}) {
    return {
        name: "third-party-notices",
        generateBundle(_options, bundle) {
            const packages = new Map();
            const addPackage = (directory) => {
                const manifest = JSON.parse(
                    fs.readFileSync(path.join(directory, "package.json"), "utf8"),
                );
                packages.set(`${manifest.name}@${manifest.version}`, { directory, manifest });
            };

            for (const output of Object.values(bundle)) {
                if (output.type !== "chunk") continue;
                for (const id of output.moduleIds) {
                    const directory = findPackageDirectory(id);
                    if (directory !== undefined) addPackage(directory);
                }
            }
            for (const name of extraPackages) {
                addPackage(fs.realpathSync(path.join(process.cwd(), "node_modules", name)));
            }

            const sections = [...packages.entries()]
                .sort(([left], [right]) => left.localeCompare(right))
                .map(([id, { directory, manifest }]) =>
                    formatPackage(id, directory, manifest, licenseFiles[manifest.name]),
                );
            this.emitFile({
                type: "asset",
                fileName,
                source: [
                    "This file lists the third-party software included in this bundle and its licence terms.",
                    ...sections,
                ].join(`\n\n${"-".repeat(80)}\n\n`),
            });
        },
    };
}

function findPackageDirectory(id) {
    const file = id.replace(/^\0/, "").split("?")[0];
    const marker = `${path.sep}node_modules${path.sep}`;
    const index = file.lastIndexOf(marker);
    if (index === -1) return undefined;

    // The package root is the first path segment under node_modules, or the first two for a scoped package.
    const segments = file.slice(index + marker.length).split(path.sep);
    const length = segments[0].startsWith("@") ? 2 : 1;
    return path.join(file.slice(0, index + marker.length), ...segments.slice(0, length));
}

function formatPackage(id, directory, manifest, licenseFile) {
    const license =
        typeof manifest.license === "string" ? manifest.license : manifest.license?.type;
    const header = [id, `License: ${license ?? "unknown"}`];
    if (manifest.homepage !== undefined) header.push(`Homepage: ${manifest.homepage}`);

    const files =
        licenseFile === undefined
            ? fs
                  .readdirSync(directory)
                  .filter((file) => LICENSE_FILE.test(file))
                  .sort()
                  .map((file) => path.join(directory, file))
            : [licenseFile];
    const texts = files.map((file) => fs.readFileSync(file, "utf8").trim());
    if (texts.length === 0) {
        throw new Error(`${id} has no licence file; pass its notice in licenseFiles.`);
    }
    return [header.join("\n"), ...texts].join("\n\n");
}
