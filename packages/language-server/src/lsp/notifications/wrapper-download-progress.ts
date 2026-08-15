import type { Connection } from "vscode-languageserver/node";

import { setWrapperResolutionOptions } from "../../integrations/rumble/client.js";
import { WRAPPER_DOWNLOAD_PROGRESS_NOTIFICATION } from "../protocol/notifications/index.js";

export function registerWrapperDownloadProgressNotification(connection: Connection): void {
    setWrapperResolutionOptions({
        onProgress: (progress) => {
            connection.sendNotification(WRAPPER_DOWNLOAD_PROGRESS_NOTIFICATION.method, progress);
        },
    });
}
