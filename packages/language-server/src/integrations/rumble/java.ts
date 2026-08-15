import { execFile } from "node:child_process";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

let javaAvailabilityPromise: Promise<void> | undefined;

export async function ensureJavaAvailable(): Promise<void> {
    if (javaAvailabilityPromise !== undefined) {
        return await javaAvailabilityPromise;
    }

    javaAvailabilityPromise = execFileAsync("java", ["-version"])
        .then(() => undefined)
        .catch((error) => {
            javaAvailabilityPromise = undefined;
            throw new Error(
                "Java is required when LSP wrapper is enabled. Install Java 17+ or disable the wrapper.",
                { cause: error },
            );
        });

    return await javaAvailabilityPromise;
}
