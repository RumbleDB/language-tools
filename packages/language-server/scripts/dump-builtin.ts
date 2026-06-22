import { spawn } from "node:child_process";
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

async function main() {
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
        const targetFile = path.join(targetDir, dump.targetFileName);
        await runBuiltinDump(launchConfig.args, dump, targetFile);
        const builtins = JSON.parse(fs.readFileSync(targetFile, "utf8")) as unknown[];
        console.log(
            `Successfully generated ${dump.label} file at ${targetFile} (${builtins.length} entries)`,
        );
    }
}

function runBuiltinDump(
    launchArgs: string[],
    dump: BuiltinDumpConfig,
    targetFile: string,
): Promise<void> {
    const javaArgs = launchArgs.map((arg) => (arg === "--daemon" ? dump.cliFlag : arg));
    const tempFile = `${targetFile}.tmp`;

    return new Promise((resolve, reject) => {
        const output = fs.createWriteStream(tempFile, { encoding: "utf8" });
        const child = spawn("java", javaArgs, {
            stdio: ["ignore", "pipe", "pipe"],
        });

        let stderr = "";

        child.stdout.pipe(output);
        child.stderr.on("data", (chunk: string | Buffer) => {
            stderr += chunk.toString();
        });

        child.on("error", (error) => {
            output.destroy();
            fs.rmSync(tempFile, { force: true });
            reject(
                new Error(
                    `Error spawning Java wrapper to dump ${dump.label}: ${error}\nRunning command was: java ${javaArgs.join(" ")}`,
                ),
            );
        });

        output.on("error", (error) => {
            child.kill();
            fs.rmSync(tempFile, { force: true });
            reject(error);
        });

        child.on("close", (code) => {
            output.end(() => {
                if (code !== 0) {
                    fs.rmSync(tempFile, { force: true });
                    reject(
                        new Error(
                            `Error running Java wrapper to dump ${dump.label}:\n${stderr}\nRunning command was: java ${javaArgs.join(" ")}`,
                        ),
                    );
                    return;
                }

                fs.renameSync(tempFile, targetFile);
                resolve();
            });
        });
    });
}

main().catch((error) => {
    console.error(error);
    process.exit(1);
});
