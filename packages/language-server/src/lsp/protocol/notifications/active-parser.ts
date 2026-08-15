import { defineNotification } from "./types.js";

export interface ActiveParserNotificationPayload {
    uri: string;
    parserId: string;
}

export const ACTIVE_PARSER_NOTIFICATION = defineNotification<
    "jsoniq/active-parser",
    ActiveParserNotificationPayload
>("jsoniq/active-parser");
