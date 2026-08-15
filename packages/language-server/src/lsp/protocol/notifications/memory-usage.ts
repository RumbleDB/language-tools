import { defineNotification } from "./types.js";

export interface MemoryUsage {
    languageServer: number;
    wrapper: number | null;
}

export const MEMORY_USAGE_NOTIFICATION = defineNotification<"jsoniq/memory-usage", MemoryUsage>(
    "jsoniq/memory-usage",
);
