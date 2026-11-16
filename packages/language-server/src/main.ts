import { startServer } from "./app/server.js";
import { ensureWrapper } from "./integrations/rumble/executable/index.js";
export type { ClientConfiguration } from "./app/server.js";
export type { LakehouseFormats } from "./app/configuration.js";

if (process.argv.includes("--ensure-wrapper")) {
    await ensureWrapper();
} else {
    startServer();
}
