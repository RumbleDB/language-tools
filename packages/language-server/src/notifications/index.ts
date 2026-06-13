import { type DownloadProgress } from "server/wrapper/executable/download.js";

import {
    ACTIVE_PARSER_NOTIFICATION,
    initializer as activeParser,
    type ActiveParserNotificationPayload,
} from "./active-parser.js";
import {
    MEMORY_USAGE_NOTIFICATION,
    initializer as memoryUsage,
    type MemoryUsage,
} from "./memory-usage.js";
import { type Notification, type RawNotificationSender } from "./types.js";
import {
    WRAPPER_DOWNLOAD_PROGRESS_NOTIFICATION,
    initializer as wrapperDownload,
} from "./wrapper-download-progress.js";

export {
    WRAPPER_DOWNLOAD_PROGRESS_NOTIFICATION,
    type DownloadProgress,
    MEMORY_USAGE_NOTIFICATION,
    type MemoryUsage,
    ACTIVE_PARSER_NOTIFICATION,
    type ActiveParserNotificationPayload,
    type Notification,
};

type InitializedNotifications = readonly [
    typeof wrapperDownload.notification,
    typeof memoryUsage.notification,
    typeof activeParser.notification,
];

export const initializeNotifications = (send: RawNotificationSender): InitializedNotifications => {
    return [
        wrapperDownload.initialize(send),
        memoryUsage.initialize(send),
        activeParser.initialize(send),
    ];
};
