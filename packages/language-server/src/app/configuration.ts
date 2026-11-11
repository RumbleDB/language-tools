import type { FormatterOptions } from "server/formatter/options.js";
import { DEFAULT_FORMATTER_OPTIONS } from "server/formatter/options.js";

export type SparkConfValue = string | number | boolean;

export type LakehouseFormat = "delta";

export type LakehouseFormats = { [F in LakehouseFormat]?: boolean };

export type InitializationOptions = {
    wrapper: {
        enabled: boolean;
        /** Lakehouse formats to configure in RumbleDB's Spark session. */
        lakehouseFormats?: Readonly<LakehouseFormats>;
        /** Spark properties passed to the wrapper JVM as `-Dkey=value`. */
        sparkConf?: Readonly<Record<string, SparkConfValue>>;
    };
    formatter: FormatterOptions;
};

export const config: Readonly<InitializationOptions> = {
    wrapper: {
        enabled: true,
    },
    formatter: { ...DEFAULT_FORMATTER_OPTIONS },
};

export function mergeConfiguration(
    overrides: Partial<InitializationOptions>,
): Readonly<InitializationOptions> {
    const merged = {
        ...config,
        ...overrides,
        wrapper: {
            ...config.wrapper,
            ...overrides.wrapper,
        },
        formatter: {
            ...config.formatter,
            ...overrides.formatter,
        },
    };

    Object.assign(config, merged);
    return config;
}
