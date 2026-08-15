import { readFile, readdir } from "node:fs/promises";
import path from "node:path";

import { describe, expect, it } from "vitest";

import { parserService } from "./services.js";
import { testDocumentFromUri } from "./test-utils.js";

type SampleExpectation = "valid" | "invalid";

const rootDirectory = process.cwd();
const samplesRoot = path.join(rootDirectory, "tests", "samples");

async function collectSampleFiles(expectation: SampleExpectation): Promise<string[]> {
    const directory = path.join(samplesRoot, expectation);
    const entries = await readdir(directory, { withFileTypes: true });

    return entries
        .filter((entry) => entry.isFile() && entry.name.endsWith(".jq"))
        .map((entry) => path.join(directory, entry.name))
        .sort((left, right) => left.localeCompare(right));
}

async function parseSample(filePath: string): Promise<number> {
    const source = await readFile(filePath, "utf8");
    const document = testDocumentFromUri(source, {
        uri: `file://${filePath}`,
    });

    return parserService.parse(document).diagnostics.length;
}

describe("JSONiq sample corpus", async () => {
    const validSamples = await collectSampleFiles("valid");
    const invalidSamples = await collectSampleFiles("invalid");

    for (const filePath of validSamples) {
        const relativePath = path.relative(rootDirectory, filePath);

        it(`accepts ${relativePath}`, async () => {
            await expect(parseSample(filePath)).resolves.toBe(0);
        });
    }

    for (const filePath of invalidSamples) {
        const relativePath = path.relative(rootDirectory, filePath);

        it(`rejects ${relativePath}`, async () => {
            await expect(parseSample(filePath)).resolves.toBeGreaterThan(0);
        });
    }
});
