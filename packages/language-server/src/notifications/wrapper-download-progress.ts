import { setWrapperResolutionOptions } from "server/integrations/rumble/client.js";
import { type DownloadProgress } from "server/integrations/rumble/executable/download.js";

import { defineNotificationInitializer } from "./types.js";

export const initializer = defineNotificationInitializer<
    "jsoniq/wrapper-download-progress",
    DownloadProgress
>({
    method: "jsoniq/wrapper-download-progress",
    initialize: (send) => {
        setWrapperResolutionOptions({
            onProgress: (progress) => {
                send(progress);
            },
        });
    },
});

export const WRAPPER_DOWNLOAD_PROGRESS_NOTIFICATION = initializer.notification;
