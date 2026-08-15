import type { Connection } from "vscode-languageserver/node";

import { registerMemoryUsageNotification } from "./memory-usage.js";
import { registerWrapperDownloadProgressNotification } from "./wrapper-download-progress.js";

export function registerNotifications(connection: Connection): void {
    registerWrapperDownloadProgressNotification(connection);
    registerMemoryUsageNotification(connection);
}
