import { setWrapperResolutionOptions } from "server/wrapper/client.js";
import { DownloadProgress } from "server/wrapper/executable/download.js";
import { Connection } from "vscode-languageserver/node";

import { setMemoryUsageNotification } from "./memory-usage.js";
import {
    WRAPPER_DOWNLOAD_PROGRESS_NOTIFICATION,
    MEMORY_USAGE_NOTIFICATION,
    MemoryUsage,
    ACTIVE_PARSER_NOTIFICATION,
    ActiveParserNotificationPayload,
} from "./types.js";

export {
    WRAPPER_DOWNLOAD_PROGRESS_NOTIFICATION,
    type DownloadProgress,
    MEMORY_USAGE_NOTIFICATION,
    type MemoryUsage,
    ACTIVE_PARSER_NOTIFICATION,
    type ActiveParserNotificationPayload,
};

export const initializeCustomNotifications = (connection: Connection): void => {
    setWrapperResolutionOptions({
        onProgress: (progress) => {
            connection.sendNotification(
                WRAPPER_DOWNLOAD_PROGRESS_NOTIFICATION,
                progress satisfies DownloadProgress,
            );
        },
    });

    setMemoryUsageNotification(connection);
};
