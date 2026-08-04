import { createLogger } from "server/utils/logger.js";

import { resolveDevLaunchConfig } from "./dev.js";
import { DownloadProgressReporter } from "./download.js";
import { resolveProdLaunchConfig } from "./prod.js";
import { SPARK_JVM_ARGS } from "./utils.js";

const logger = createLogger("wrapper:jar-resolution");

export interface WrapperLaunchConfig {
    args: string[];
}

export interface WrapperResolutionOptions {
    onProgress?: DownloadProgressReporter;
}

export async function resolveWrapperLaunchConfig(
    options: WrapperResolutionOptions = {},
): Promise<WrapperLaunchConfig> {
    const devConfig = resolveDevLaunchConfig();
    const config = devConfig ?? (await resolveProdLaunchConfig(options));
    if (devConfig === undefined) {
        logger.debug(
            "No development wrapper configuration found, falling back to production configuration.",
        );
    }

    return {
        args: [...SPARK_JVM_ARGS, ...config.args],
    };
}
