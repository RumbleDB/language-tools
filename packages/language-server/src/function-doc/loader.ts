import fs from "node:fs";
import path from "node:path";

import { getAssetsPath } from "server/utils/assets.js";

import type { FunctionEntry } from "./types.js";

let w3Catalog: Record<string, FunctionEntry> | null = null;

export function getW3Catalog(): Record<string, FunctionEntry> {
    if (w3Catalog === null) {
        try {
            const assetsPath = getAssetsPath();
            const filePath = path.join(assetsPath, "function-doc", "w3-functions.json");
            const content = fs.readFileSync(filePath, "utf-8");
            w3Catalog = JSON.parse(content);
        } catch (error) {
            console.error("Failed to load W3 function catalog:", error);
            w3Catalog = {};
        }
    }
    return w3Catalog!;
}
