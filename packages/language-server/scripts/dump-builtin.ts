import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { resolveDevLaunchConfig } from "../src/wrapper/executable/dev.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PACKAGE_ROOT = path.resolve(__dirname, "..");

type BuiltinDumpConfig = {
    cliFlag: "--dump-builtin-functions" | "--dump-builtin-types";
    label: string;
    targetFileName: "builtin-functions.json" | "builtin-types.json";
};

function main() {
    console.log("Generating pregenerated builtin catalogs...");

    const launchConfig = resolveDevLaunchConfig();
    if (launchConfig === undefined) {
        console.error(
            "Error: Local wrapper JAR or runtime classpath not found. Please build rumble-lsp-wrapper first.",
        );
        process.exit(1);
    }

    const targetDir = path.join(PACKAGE_ROOT, "assets");
    if (!fs.existsSync(targetDir)) {
        fs.mkdirSync(targetDir, { recursive: true });
    }

    const dumps: BuiltinDumpConfig[] = [
        {
            cliFlag: "--dump-builtin-functions",
            label: "builtin functions",
            targetFileName: "builtin-functions.json",
        },
        {
            cliFlag: "--dump-builtin-types",
            label: "builtin types",
            targetFileName: "builtin-types.json",
        },
    ];

    for (const dump of dumps) {
        const builtins = runBuiltinDump(launchConfig.args, dump);
        const targetFile = path.join(targetDir, dump.targetFileName);
        fs.writeFileSync(targetFile, JSON.stringify(builtins, null, 4), "utf8");
        console.log(
            `Successfully generated ${dump.label} file at ${targetFile} (${builtins.length} entries)`,
        );
    }
}

function runBuiltinDump(launchArgs: string[], dump: BuiltinDumpConfig): unknown[] {
    const javaArgs = launchArgs.map((arg) => (arg === "--daemon" ? dump.cliFlag : arg));
    const result = spawnSync("java", javaArgs, {
        encoding: "utf8",
    });

    if (result.status !== 0) {
        console.error(`Error running Java wrapper to dump ${dump.label}:`);
        console.error(result.stderr);
        process.exit(1);
    }

    try {
        return JSON.parse(result.stdout.trim()) as unknown[];
    } catch (e) {
        console.error(`Failed to parse dumped ${dump.label} JSON:`, e);
        console.error("Stdout was:", result.stdout);
        process.exit(1);
    }
}

main();
