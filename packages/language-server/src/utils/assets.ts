import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const CURRENT_MODULE_DIR = path.dirname(fileURLToPath(import.meta.url));

export function findPackageRoot(): string {
    let dir = CURRENT_MODULE_DIR;

    while (true) {
        const pkg = path.join(dir, "package.json");
        if (fs.existsSync(pkg)) {
            return dir;
        }

        const parent = path.dirname(dir);
        if (parent === dir) {
            throw new Error("Could not find package.json");
        }
        dir = parent;
    }
}

export function getAssetsPath(): string {
    return path.join(findPackageRoot(), "assets");
}
