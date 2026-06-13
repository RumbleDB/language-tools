import { getWrapperClient } from "server/wrapper/client.js";

import { defineNotificationInitializer } from "./types.js";

export type MemoryUsage = {
    languageServer: number;
    wrapper: number | null;
};

const MEMORY_USAGE_POLL_INTERVAL_MS = 5000;
export const initializer = defineNotificationInitializer<"jsoniq/memory-usage", MemoryUsage>({
    method: "jsoniq/memory-usage",
    initialize: (send) => {
        const client = getWrapperClient();

        const poll = async (): Promise<void> => {
            try {
                const wrapperUsage = client.isUsable() ? await client.getMemoryUsage() : null;
                const languageServerUsage = process.memoryUsage().rss;

                const usage: MemoryUsage = {
                    languageServer: languageServerUsage,
                    wrapper: wrapperUsage?.rssBytes || null,
                };

                send(usage);
            } finally {
                setTimeout(() => {
                    void poll();
                }, MEMORY_USAGE_POLL_INTERVAL_MS);
            }
        };

        poll();
    },
});

export const MEMORY_USAGE_NOTIFICATION = initializer.notification;
