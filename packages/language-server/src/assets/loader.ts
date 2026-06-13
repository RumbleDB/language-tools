import fs from "node:fs";
import path from "node:path";

import { getAssetsPath } from "server/utils/assets.js";
import { createLogger } from "server/utils/logger.js";

const logger = createLogger("assets:loader");

export function loadJsonAsset<T>(relativeAssetPath: string): T | null {
    try {
        const assetsPath = getAssetsPath();
        const filePath = path.join(assetsPath, relativeAssetPath);
        if (fs.existsSync(filePath)) {
            const content = fs.readFileSync(filePath, "utf-8");
            return JSON.parse(content) as T;
        }
    } catch (error) {
        logger.error(`Failed to load JSON asset '${relativeAssetPath}':`, error);
    }
    return null;
}
