import { resolveWrapperLaunchConfig } from "./index.js";

/// For testing purposes, allow running this file directly to see the resolved launch config
resolveWrapperLaunchConfig()
    .then((config) => {
        console.log("Resolved wrapper launch config:", config);
    })
    .catch((error) => {
        console.error("Error resolving wrapper launch config:", error);
        process.exit(1);
    });
