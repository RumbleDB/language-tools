import fs from "node:fs";
import path from "node:path";

import { defaultNamespaces } from "server/analysis/default-namespaces.js";
import { QNameToString } from "server/analysis/names.js";
import { getAssetsPath } from "server/utils/assets.js";

import type { FunctionEntry } from "./types.js";

type FunctionKey = string; // We will use format "namespace:localName" as key

const docs: Record<FunctionKey, FunctionEntry> = {};

const filesToLoad = ["w3-functions.json", "custom-functions.json"];

let docsLoaded = false;
function loadFunctionDocs(): void {
    try {
        const assetsPath = getAssetsPath();
        const docsDir = path.join(assetsPath, "function-doc");

        for (const fileName of filesToLoad) {
            const filePath = path.join(docsDir, fileName);
            if (!fs.existsSync(filePath)) {
                continue;
            }

            const content = fs.readFileSync(filePath, "utf-8");
            const fileDocs = JSON.parse(content) as Record<string, FunctionEntry>;

            for (const [originalKey, value] of Object.entries(fileDocs)) {
                /// The original key is in prefix:localName format
                /// We need to expand it to full namespace:localName format to match the keys used in the codebase
                const [prefix, localName] = originalKey.split(":");

                const namespace = defaultNamespaces.get(prefix!);
                if (!namespace) {
                    console.warn(`Unknown namespace for key: ${originalKey}`);
                    continue;
                }
                const key = QNameToString({ localName: localName!, namespaceUri: namespace }, true);
                docs[key] = value;
            }
        }
        docsLoaded = true;
    } catch (error) {
        console.error("Failed to load function docs:", error);
    }
}

export function getFunctionDocs(): Record<string, FunctionEntry> {
    if (!docsLoaded) {
        loadFunctionDocs();
    }
    return docs;
}
