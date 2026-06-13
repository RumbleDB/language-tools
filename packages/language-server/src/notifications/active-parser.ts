import { defineNotificationInitializer } from "./types.js";

export type ActiveParserNotificationPayload = {
    uri: string;
    parserId: string;
};

export const initializer = defineNotificationInitializer<
    "jsoniq/active-parser",
    ActiveParserNotificationPayload
>({
    method: "jsoniq/active-parser",
});

export const ACTIVE_PARSER_NOTIFICATION = initializer.notification;
