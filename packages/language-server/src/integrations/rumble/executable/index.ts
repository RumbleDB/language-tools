import { config as serverConfig } from "server/app/configuration.js";
import { buildSparkConf } from "server/integrations/rumble/lakehouse.js";
import { createLogger } from "server/utils/logger.js";

import { resolveDevLaunchConfig } from "./dev.js";
import { DownloadProgressReporter } from "./download.js";
import { resolveProdLaunchConfig } from "./prod.js";
import { SPARK_JVM_ARGS, sparkConfToJvmArgs } from "./utils.js";

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

    const sparkConfArgs = sparkConfToJvmArgs(buildSparkConf(serverConfig.wrapper), (key) =>
        logger.warn(
            `Ignoring sparkConf entry "${key}": keys must start with "spark." and values must be strings, numbers or booleans.`,
        ),
    );

    return {
        args: [...SPARK_JVM_ARGS, ...sparkConfArgs, ...config.args],
    };
}
