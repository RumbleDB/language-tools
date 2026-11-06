import type { FormatterOptions } from "server/formatter/options.js";
import { DEFAULT_FORMATTER_OPTIONS } from "server/formatter/options.js";

export type InitializationOptions = {
    wrapper: {
        enabled: boolean;
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
