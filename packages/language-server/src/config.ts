export type InitializationOptions = {
    wrapper: {
        enabled: boolean;
    };
};

export const config: Readonly<InitializationOptions> = {
    wrapper: {
        enabled: true,
    },
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
    };

    Object.assign(config, merged);
    return config;
}
