import fs from "node:fs";
import path from "node:path";

import { defaultNamespaces } from "server/analysis/default-namespaces.js";
import { QNameToString } from "server/analysis/names.js";
import { getAssetsPath } from "server/utils/assets.js";

import type { FunctionEntry } from "./types.js";

type FunctionKey = string; // We will use format "namespace:localName" as key

const catalog: Record<FunctionKey, FunctionEntry> = {};

let isW3CatalogLoaded = false;
function loadW3Catalog(): void {
    try {
        const assetsPath = getAssetsPath();
        const filePath = path.join(assetsPath, "function-doc", "w3-functions.json");
        const content = fs.readFileSync(filePath, "utf-8");
        const w3Catalog = JSON.parse(content) as Record<string, FunctionEntry>;

        for (const [originalKey, value] of Object.entries(w3Catalog)) {
            /// The original key is in prefix:localName format
            /// We need to expand it to full namespace:localName format to match the keys used in the codebase
            const [prefix, localName] = originalKey.split(":");

            const namespace = defaultNamespaces.get(prefix!);
            if (!namespace) {
                console.warn(`Unknown namespace for key: ${originalKey}`);
                continue;
            }
            const key = QNameToString({ localName: localName!, namespaceUri: namespace }, true);
            catalog[key] = value;
        }
        isW3CatalogLoaded = true;
    } catch (error) {
        console.error("Failed to load W3 function catalog:", error);
    }
}

export function getFunctionDocs(): Record<string, FunctionEntry> {
    if (!isW3CatalogLoaded) {
        loadW3Catalog();
    }
    return catalog;
}
