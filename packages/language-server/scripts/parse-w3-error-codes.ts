import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { XMLParser } from "fast-xml-parser";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const W3_ERROR_CODES_URL = "https://www.w3.org/2005/xqt-errors/";
const OUTPUT_FILE_PATH = path.join(__dirname, "..", "assets", "error-doc", "w3-errors.json");

/** A standard XPath, XQuery, or XSLT error listed in the W3C err namespace. */
interface W3ErrorCode {
    /** QName accepted by an XQuery/XPath catch clause, for example `err:FOAR0001`. */
    code: string;
    /** The short W3C description of the error condition. */
    description: string;
    /** The section of the W3C error-code catalogue which groups this error. */
    category: string;
    /** Normative definition of the error condition in its owning specification. */
    specificationUrl: string;
}

type XmlNode = Record<string, unknown>;

function asNodes(value: unknown): XmlNode[] {
    if (Array.isArray(value)) {
        return value.filter((item): item is XmlNode => typeof item === "object" && item !== null);
    }
    return typeof value === "object" && value !== null ? [value as XmlNode] : [];
}

function getText(value: unknown): string {
    if (typeof value === "string" || typeof value === "number") {
        return String(value);
    }
    if (Array.isArray(value)) {
        return value.map(getText).join(" ");
    }
    if (typeof value === "object" && value !== null) {
        return Object.entries(value as XmlNode)
            .filter(([key]) => key !== "href" && key !== "class" && key !== "id")
            .map(([, child]) => getText(child))
            .join(" ");
    }
    return "";
}

function findSections(value: unknown, sections: XmlNode[] = []): XmlNode[] {
    for (const node of asNodes(value)) {
        for (const [name, child] of Object.entries(node)) {
            if (name === "div2") {
                sections.push(...asNodes(child));
            }
            findSections(child, sections);
        }
    }
    return sections;
}

function parseErrorCodes(xml: string): Record<string, W3ErrorCode> {
    const parser = new XMLParser({
        ignoreAttributes: false,
        attributeNamePrefix: "",
        trimValues: true,
        isArray: (name) => ["div2", "dt", "dd"].includes(name),
    });
    const document = parser.parse(xml) as XmlNode;
    const errors: Record<string, W3ErrorCode> = {};

    for (const section of findSections(document)) {
        const category = getText(section.h2).replace(/\s+/g, " ").trim() || "Error Codes";
        for (const list of asNodes(section.dl)) {
            const terms = asNodes(list.dt);
            const descriptions = Array.isArray(list.dd) ? list.dd : [list.dd];

            for (let index = 0; index < terms.length; index++) {
                const anchor = asNodes(terms[index].a)[0];
                const code = getText(anchor).trim();
                const description = getText(descriptions[index]).replace(/\s+/g, " ").trim();
                const specificationUrl = typeof anchor?.href === "string" ? anchor.href : "";
                if (!/^err:[A-Z]+\d+$/.test(code) || !description || !specificationUrl) {
                    continue;
                }

                errors[code] = {
                    code,
                    description,
                    category,
                    specificationUrl,
                };
            }
        }
    }

    if (Object.keys(errors).length === 0) {
        throw new Error("No W3C error codes found; the source page structure may have changed.");
    }

    return errors;
}

async function main() {
    console.log(`Fetching W3C error codes from: ${W3_ERROR_CODES_URL}`);
    const response = await fetch(W3_ERROR_CODES_URL);
    if (!response.ok) {
        throw new Error(
            `Failed to fetch W3C error codes: ${response.status} ${response.statusText}`,
        );
    }

    const errors = parseErrorCodes(await response.text());
    await fs.mkdir(path.dirname(OUTPUT_FILE_PATH), { recursive: true });
    await fs.writeFile(OUTPUT_FILE_PATH, `${JSON.stringify(errors, null, 4)}\n`, "utf-8");
    console.log(`Successfully generated ${Object.keys(errors).length} W3C error-code entries.`);
}

main().catch((error) => {
    console.error("Error occurred while generating W3C error codes:", error);
    process.exit(1);
});
