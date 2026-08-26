import type { RumbleWrapperClient } from "server/integrations/rumble/client.js";
import type { Connection } from "vscode-languageserver/node";

import { registerMemoryUsageNotification } from "./memory-usage.js";
import { registerWrapperDownloadProgressNotification } from "./wrapper-download-progress.js";

export function registerNotifications(connection: Connection, wrapper: RumbleWrapperClient): void {
    registerWrapperDownloadProgressNotification(connection, wrapper);
    registerMemoryUsageNotification(connection, wrapper);
}
