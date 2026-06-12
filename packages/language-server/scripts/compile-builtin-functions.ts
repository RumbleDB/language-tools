import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { resolveDevLaunchConfig } from "../src/wrapper/executable/dev.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PACKAGE_ROOT = path.resolve(__dirname, "..");

function main() {
    console.log("Generating pregenerated builtin functions list...");

    const launchConfig = resolveDevLaunchConfig();
    if (launchConfig === undefined) {
        console.error(
            "Error: Local wrapper JAR or runtime classpath not found. Please build rumble-lsp-wrapper first.",
        );
        process.exit(1);
    }

    const javaArgs = launchConfig.args.map((arg) =>
        arg === "--daemon" ? "--dump-builtin-functions" : arg,
    );

    const result = spawnSync("java", javaArgs, {
        encoding: "utf8",
    });

    if (result.status !== 0) {
        console.error("Error running Java wrapper to dump builtins:");
        console.error(result.stderr);
        process.exit(1);
    }

    let builtins;
    try {
        builtins = JSON.parse(result.stdout.trim());
    } catch (e) {
        console.error("Failed to parse dumped builtins JSON:", e);
        console.error("Stdout was:", result.stdout);
        process.exit(1);
    }

    const targetDir = path.join(PACKAGE_ROOT, "assets");
    if (!fs.existsSync(targetDir)) {
        fs.mkdirSync(targetDir, { recursive: true });
    }

    const targetFile = path.join(targetDir, "builtin-functions.json");
    fs.writeFileSync(targetFile, JSON.stringify(builtins, null, 4), "utf8");

    console.log(
        `Successfully generated builtins file at ${targetFile} (${builtins.length} functions)`,
    );
}

main();
