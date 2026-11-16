import { config as serverConfig } from "server/app/configuration.js";
import { buildSparkConf } from "server/integrations/rumble/lakehouse.js";
import { createLogger } from "server/utils/logger.js";

import { resolveDevLaunchConfig } from "./dev.js";
import { DownloadProgressReporter } from "./download.js";
import { resolveProdLaunchConfig } from "./prod.js";
import { resolveWrapperJarOverride, SPARK_JVM_ARGS, sparkConfToJvmArgs } from "./utils.js";

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
    const config = await resolveLaunchConfig(options);

    const sparkConfArgs = sparkConfToJvmArgs(buildSparkConf(serverConfig.wrapper), (key) =>
        logger.warn(
            `Ignoring sparkConf entry "${key}": keys must start with "spark." and values must be strings, numbers or booleans.`,
        ),
    );

    return {
        args: [...SPARK_JVM_ARGS, ...sparkConfArgs, ...config.args],
    };
}

/**
 * `main.mjs --ensure-wrapper`: downloads the wrapper JAR unless it is cached, and prints the command that starts it.
 * Exits with code 1 when the JAR cannot be resolved.
 */
export async function ensureWrapper(): Promise<void> {
    try {
        const { args } = await resolveWrapperLaunchConfig();
        console.log(["java", ...args].join(" "));
    } catch (error) {
        console.error(error instanceof Error ? error.message : String(error));
        process.exitCode = 1;
    }
}

async function resolveLaunchConfig(
    options: WrapperResolutionOptions,
): Promise<WrapperLaunchConfig> {
    const overrideConfig = resolveWrapperJarOverride();
    if (overrideConfig !== undefined) {
        logger.info(
            `Using the wrapper jar from JSONIQ_LSP_WRAPPER_JAR: ${process.env.JSONIQ_LSP_WRAPPER_JAR}`,
        );
        return overrideConfig;
    }

    const devConfig = resolveDevLaunchConfig();
    if (devConfig !== undefined) {
        return devConfig;
    }
    logger.debug(
        "No development wrapper configuration found, falling back to production configuration.",
    );
    return resolveProdLaunchConfig(options);
}
