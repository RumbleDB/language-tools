import { type RumbleWrapperClient, getWrapperClient } from "server/integrations/rumble/client.js";
import type { Connection } from "vscode-languageserver/node";

import { WRAPPER_DOWNLOAD_PROGRESS_NOTIFICATION } from "../protocol/notifications/index.js";

export function registerWrapperDownloadProgressNotification(
    connection: Connection,
    wrapper: RumbleWrapperClient = getWrapperClient(),
): void {
    wrapper.setResolutionOptions({
        onProgress: (progress) => {
            connection.sendNotification(WRAPPER_DOWNLOAD_PROGRESS_NOTIFICATION.method, progress);
        },
    });
}
