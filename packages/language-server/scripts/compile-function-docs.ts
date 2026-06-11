import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import matter from "gray-matter";

import type { FunctionEntry } from "../src/function-doc/types";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const DOCS_DIR = path.join(__dirname, "..", "docs", "functions");
const OUTPUT_FILE_PATH = path.join(__dirname, "..", "assets", "function-doc", "custom.json");

function getMarkdownFiles(dir: string): string[] {
    if (!fs.existsSync(dir)) {
        return [];
    }
    const files: string[] = [];
    const items = fs.readdirSync(dir, { withFileTypes: true });
    for (const item of items) {
        const fullPath = path.join(dir, item.name);
        if (item.isDirectory()) {
            files.push(...getMarkdownFiles(fullPath));
        } else if (item.isFile() && item.name.endsWith(".md")) {
            files.push(fullPath);
        }
    }
    return files;
}

function main() {
    console.log(`Compiling function docs from ${DOCS_DIR}...`);

    const catalog: Record<string, FunctionEntry> = {};
    const files = getMarkdownFiles(DOCS_DIR);

    if (files.length === 0) {
        console.log("No custom markdown files found. Writing empty custom catalog.");
    }

    for (const file of files) {
        try {
            const fileContent = fs.readFileSync(file, "utf-8");
            const { data, content } = matter(fileContent);

            const name = data.name;
            const prefix = data.prefix || "fn";
            if (!name) {
                console.warn(`Skipping ${file}: 'name' is missing in frontmatter.`);
                continue;
            }

            const key = `${prefix}:${name}`;

            const entry: FunctionEntry = {
                name,
                prefix,
                summary: data.summary || "",
                signatures: data.signatures || [],
            };

            const rules = content.trim();
            if (rules) {
                entry.rules = rules;
            }

            if (data.errors) entry.errors = String(data.errors);
            if (data.notes) entry.notes = String(data.notes);
            if (data.examples) entry.examples = String(data.examples);
            if (Array.isArray(data.properties)) entry.properties = data.properties.map(String);

            if (catalog[key]) {
                console.warn("Found duplicated entries: ", key);
                catalog[key].signatures.push(...entry.signatures);
                if (entry.summary && !catalog[key].summary) {
                    catalog[key].summary = entry.summary;
                }
                if (entry.rules) {
                    catalog[key].rules = (catalog[key].rules || "") + "\n\n" + entry.rules;
                }
            } else {
                catalog[key] = entry;
            }
        } catch (err) {
            console.error(`Failed to parse ${file}:`, err);
        }
    }

    const assetsDir = path.dirname(OUTPUT_FILE_PATH);
    if (!fs.existsSync(assetsDir)) {
        fs.mkdirSync(assetsDir, { recursive: true });
    }

    fs.writeFileSync(OUTPUT_FILE_PATH, JSON.stringify(catalog, null, 4), "utf-8");

    console.log(
        `Successfully compiled ${Object.keys(catalog).length} custom function entries to ${OUTPUT_FILE_PATH}`,
    );
}

main();
