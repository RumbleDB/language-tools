import { getWrapperClient } from "server/integrations/rumble/client.js";
import type { Connection } from "vscode-languageserver/node";

import { MEMORY_USAGE_NOTIFICATION, type MemoryUsage } from "../protocol/notifications/index.js";

const MEMORY_USAGE_POLL_INTERVAL_MS = 5000;

export function registerMemoryUsageNotification(connection: Connection): void {
    const client = getWrapperClient();

    const poll = async (): Promise<void> => {
        try {
            const wrapperUsage = client.isUsable() ? await client.getMemoryUsage() : null;
            const usage: MemoryUsage = {
                languageServer: process.memoryUsage().rss,
                wrapper: wrapperUsage?.rssBytes || null,
            };
            connection.sendNotification(MEMORY_USAGE_NOTIFICATION.method, usage);
        } finally {
            setTimeout(() => void poll(), MEMORY_USAGE_POLL_INTERVAL_MS);
        }
    };

    void poll();
}
