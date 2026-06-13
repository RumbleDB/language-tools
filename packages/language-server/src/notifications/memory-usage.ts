import { getWrapperClient } from "server/wrapper/client.js";

import { MEMORY_USAGE_NOTIFICATION, MemoryUsage } from "./types.js";

const MEMORY_USAGE_POLL_INTERVAL_MS = 5000;
export function setMemoryUsageNotification(connection: any) {
    const client = getWrapperClient();

    const poll = async (): Promise<void> => {
        try {
            const wrapperUsage = client.isUsable() ? await client.getMemoryUsage() : null;
            const languageServerUsage = process.memoryUsage().rss;

            const usage: MemoryUsage = {
                languageServer: languageServerUsage,
                wrapper: wrapperUsage?.rssBytes || null,
            };

            connection.sendNotification(MEMORY_USAGE_NOTIFICATION, usage satisfies MemoryUsage);
        } finally {
            setTimeout(() => {
                void poll();
            }, MEMORY_USAGE_POLL_INTERVAL_MS);
        }
    };

    poll();
}
