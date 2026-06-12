import fs from "node:fs";
import path from "node:path";

import { defaultNamespaces } from "server/analysis/default-namespaces.js";
import { QNameToString, type FunctionName } from "server/analysis/names.js";
import type { FunctionEntry } from "server/function-doc/types.js";
import { getAssetsPath } from "server/utils/assets.js";
import type { WrapperFunctionSignature } from "server/wrapper/types.js";

export interface BuiltinFunctionRaw {
    name: FunctionName;
    signature: WrapperFunctionSignature;
}

let builtinFunctions: BuiltinFunctionRaw[] | null = null;
const docs: Record<string, FunctionEntry> = {};
let docsLoaded = false;

export function loadBuiltinFunctions(): BuiltinFunctionRaw[] {
    if (builtinFunctions !== null) {
        return builtinFunctions;
    }
    try {
        const assetsPath = getAssetsPath();
        const filePath = path.join(assetsPath, "builtin-functions.json");
        if (fs.existsSync(filePath)) {
            const content = fs.readFileSync(filePath, "utf-8");
            builtinFunctions = JSON.parse(content) as BuiltinFunctionRaw[];
        } else {
            builtinFunctions = [];
        }
    } catch (error) {
        console.error("Failed to load pregenerated builtin functions:", error);
        builtinFunctions = [];
    }
    return builtinFunctions;
}

export function loadFunctionDocs(): Record<string, FunctionEntry> {
    if (docsLoaded) {
        return docs;
    }
    try {
        const assetsPath = getAssetsPath();
        const docsDir = path.join(assetsPath, "function-doc");
        const filesToLoad = ["w3-functions.json", "custom-functions.json"];

        for (const fileName of filesToLoad) {
            const filePath = path.join(docsDir, fileName);
            if (!fs.existsSync(filePath)) {
                continue;
            }

            const content = fs.readFileSync(filePath, "utf-8");
            const fileDocs = JSON.parse(content) as Record<string, FunctionEntry>;

            for (const [originalKey, value] of Object.entries(fileDocs)) {
                const [prefix, localName] = originalKey.split(":");
                const namespace = defaultNamespaces.get(prefix!);
                if (!namespace) {
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
    return docs;
}
