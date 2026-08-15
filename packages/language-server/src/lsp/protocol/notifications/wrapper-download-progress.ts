import type { DownloadProgress } from "server/integrations/rumble/executable/download.js";

import { defineNotification } from "./types.js";

export type { DownloadProgress };

export const WRAPPER_DOWNLOAD_PROGRESS_NOTIFICATION = defineNotification<
    "jsoniq/wrapper-download-progress",
    DownloadProgress
>("jsoniq/wrapper-download-progress");
