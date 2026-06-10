import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { XMLParser } from "fast-xml-parser";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const W3_CATALOG_URL =
    "https://www.w3.org/TR/2017/REC-xpath-functions-31-20170321/function-catalog.xml";
const OUTPUT_FILE_PATH = path.join(__dirname, "..", "assets", "function-doc", "w3-functions.json");

import type { FunctionEntry, Parameter, Signature } from "../src/function-doc/types.js";

interface XmlParameter {
    name?: string;
    type?: string;
    default?: string | number | boolean;
    usage?: string;
}

interface XmlProto {
    "return-type"?: string;
    "fos:arg"?: XmlParameter[];
}

interface XmlFunction {
    name?: string;
    prefix?: string;
    "fos:summary"?: string;
    "fos:rules"?: string;
    "fos:errors"?: string;
    "fos:notes"?: string;
    "fos:examples"?: string;
    "fos:properties"?: string;
    "fos:signatures"?: {
        "fos:proto"?: XmlProto[];
    };
}

function convertTableToMarkdown(tableHtml: string): string {
    const rows: string[][] = [];
    const trMatches = tableHtml.match(/<tr[^>]*>([\s\S]*?)<\/tr>/gi);
    if (!trMatches) return "";

    let hasHeaders = false;
    for (const trHtml of trMatches) {
        const cells: string[] = [];
        const cellMatches = trHtml.match(/<(th|td)[^>]*>([\s\S]*?)<\/\1>/gi);
        if (!cellMatches) continue;

        if (trHtml.includes("<th")) {
            hasHeaders = true;
        }

        for (const cellHtml of cellMatches) {
            const contentMatch = cellHtml.match(/<(th|td)[^>]*>([\s\S]*?)<\/\1>/i);
            let content = contentMatch ? contentMatch[2] : "";
            content = cleanXmlContent(content).replace(/\s+/g, " ").trim();
            cells.push(content);
        }
        rows.push(cells);
    }

    if (rows.length === 0) return "";

    const markdownRows: string[] = [];
    const headerRow = rows[0];
    markdownRows.push("| " + headerRow.join(" | ") + " |");
    markdownRows.push("| " + headerRow.map(() => "---").join(" | ") + " |");

    const startIdx = hasHeaders || rows.length > 1 ? 1 : 0;
    for (let i = startIdx; i < rows.length; i++) {
        markdownRows.push("| " + rows[i].join(" | ") + " |");
    }

    return "\n\n" + markdownRows.join("\n") + "\n\n";
}

function decodeEntities(str: string): string {
    return str
        .replace(/&lt;/g, "<")
        .replace(/&gt;/g, ">")
        .replace(/&amp;/g, "&")
        .replace(/&quot;/g, '"')
        .replace(/&apos;/g, "'");
}

function cleanXmlContent(text: string | undefined): string {
    if (!text || typeof text !== "string") {
        return "";
    }

    // Convert tables first
    text = text.replace(/<table[^>]*>([\s\S]*?)<\/table>/gi, (match) => {
        return convertTableToMarkdown(match);
    });

    // Formatting tags
    text = text.replace(/<code[^>]*>([\s\S]*?)<\/code>/gi, "`$1`");
    text = text.replace(/<var[^>]*>([\s\S]*?)<\/var>/gi, "_$1_");
    text = text.replace(/<sup[^>]*>([\s\S]*?)<\/sup>/gi, "^($1)");
    text = text.replace(/<term[^>]*>([\s\S]*?)<\/term>/gi, "*$1*");
    text = text.replace(/<termref[^>]*>([\s\S]*?)<\/termref>/gi, "*$1*");
    text = text.replace(/<xtermref[^>]*>([\s\S]*?)<\/xtermref>/gi, "*$1*");
    text = text.replace(/<quote[^>]*>([\s\S]*?)<\/quote>/gi, '"$1"');
    text = text.replace(/<emph[^>]*>([\s\S]*?)<\/emph>/gi, "*$1*");
    text = text.replace(/<b[^>]*>([\s\S]*?)<\/b>/gi, "**$1**");
    text = text.replace(/<rfc2119[^>]*>([\s\S]*?)<\/rfc2119>/gi, "**$1**");

    // Spec references
    text = text.replace(/<specref\s+ref="([^"]+)"[^/>]*\/?>/gi, "[*_$1_*]");
    text = text.replace(/<xspecref\s+spec="([^"]+)"\s+ref="([^"]+)"[^/>]*\/?>/gi, "[*_$2_*]");
    text = text.replace(/<bibref\s+ref="([^"]+)"[^/>]*\/?>/gi, "[_Reference: $1_]");

    // Error references
    text = text.replace(/<(?:x)?errorref\s+([^>]*)\/?>/gi, (match, attrsStr) => {
        const specMatch = attrsStr.match(/spec="([^"]+)"/i);
        const classMatch = attrsStr.match(/class="([^"]+)"/i);
        const codeMatch = attrsStr.match(/code="([^"]+)"/i);

        const spec = specMatch ? specMatch[1].replace(/\d+/g, "") : "FO";
        const cls = classMatch ? classMatch[1] : "";
        const code = codeMatch ? codeMatch[1] || codeMatch[2] : "";

        if (cls || code) {
            return `[err:${spec}${cls}${code}]`;
        }
        return "[error]";
    });

    // eg blocks
    text = text.replace(/<eg[^>]*>([\s\S]*?)<\/eg>/gi, (match, codeContent) => {
        const decodedCode = decodeEntities(codeContent.trim());
        return `\n\n\`\`\`jsoniq\n${decodedCode}\n\`\`\`\n\n`;
    });

    // Lists
    text = text.replace(/<ulist[^>]*>([\s\S]*?)<\/ulist>/gi, (match, content) => {
        const items = content.replace(/<item[^>]*>([\s\S]*?)<\/item>/gi, (m, itemContent) => {
            return `\n- ${itemContent.trim()}`;
        });
        return `\n${items}\n`;
    });

    text = text.replace(/<olist[^>]*>([\s\S]*?)<\/olist>/gi, (match, content) => {
        const items = content.replace(/<item[^>]*>([\s\S]*?)<\/item>/gi, (m, itemContent) => {
            return `\n1. ${itemContent.trim()}`;
        });
        return `\n${items}\n`;
    });

    // Paragraphs
    text = text.replace(/<(?:p|para)[^>]*>([\s\S]*?)<\/(?:p|para)>/gi, "$1\n\n");

    // Strip other remaining XML/HTML tags
    text = text.replace(/<[^>]+>/g, "");

    // Decode HTML/XML entities
    text = decodeEntities(text);

    // Clean up spacing and newlines
    text = text.replace(/[ \t]+/g, " ");
    text = text.replace(/\n{3,}/g, "\n\n");

    return text.trim();
}

function parseExamples(examplesXml: string | undefined): string {
    if (!examplesXml || typeof examplesXml !== "string") return "";

    const exampleBlocks = examplesXml.match(/<fos:example[^>]*>([\s\S]*?)<\/fos:example>/gi);
    if (!exampleBlocks) {
        return cleanXmlContent(examplesXml);
    }

    const formattedExamples: string[] = [];
    for (const block of exampleBlocks) {
        const testMatches = block.match(/<fos:test[^>]*>([\s\S]*?)<\/fos:test>/gi);
        if (!testMatches) {
            formattedExamples.push(cleanXmlContent(block));
            continue;
        }

        const tests: string[] = [];
        for (const testHtml of testMatches) {
            const expressionMatch = testHtml.match(
                /<fos:expression[^>]*>([\s\S]*?)<\/fos:expression>/i,
            );
            const expression = expressionMatch ? cleanXmlContent(expressionMatch[1]).trim() : "";

            const resultMatch = testHtml.match(/<fos:result[^>]*>([\s\S]*?)<\/fos:result>/i);
            const errorResultMatch =
                testHtml.match(/<fos:error-result[^>]*code="([^"]+)"[^/>]*\/?>/i) ||
                testHtml.match(/<fos:error-result[^>]*error-code="([^"]+)"[^/>]*\/?>/i);
            const anyResultMatch = testHtml.includes("<fos:any-result");

            let resultStr = "";
            if (resultMatch) {
                resultStr = `=> ${cleanXmlContent(resultMatch[1]).trim()}`;
            } else if (errorResultMatch) {
                const code = errorResultMatch[1];
                const prefix = code.includes(":") ? "" : "err:";
                resultStr = `=> raises error ${prefix}${code}`;
            } else if (anyResultMatch) {
                resultStr = `=> (any value)`;
            }

            const postambleMatch = testHtml.match(
                /<fos:postamble[^>]*>([\s\S]*?)<\/fos:postamble>/i,
            );
            const postamble = postambleMatch ? cleanXmlContent(postambleMatch[1]).trim() : "";

            let testStr = `\`\`\`jsoniq\n${expression}\n${resultStr}\n\`\`\``;
            if (postamble) {
                testStr += `\n${postamble}\n`;
            }
            tests.push(testStr);
        }
        formattedExamples.push(tests.join("\n"));
    }

    return formattedExamples.join("\n\n");
}

function parseProperties(propertiesXml: string | undefined): string[] {
    if (!propertiesXml || typeof propertiesXml !== "string") return [];
    const matches = propertiesXml.match(/<fos:property[^>]*>([\s\S]*?)<\/fos:property>/gi);
    if (!matches) return [];
    return matches
        .map((m) => {
            const contentMatch = m.match(/<fos:property[^>]*>([\s\S]*?)<\/fos:property>/i);
            return contentMatch ? contentMatch[1].trim() : "";
        })
        .filter((p) => p !== "");
}

async function main() {
    console.log(`Fetching W3 function catalog from: ${W3_CATALOG_URL}...`);
    const response = await fetch(W3_CATALOG_URL);
    if (!response.ok) {
        throw new Error(
            `Failed to fetch function catalog: ${response.status} ${response.statusText}`,
        );
    }

    const xmlText = await response.text();
    console.log("Parsing XML catalog...");

    const parser = new XMLParser({
        ignoreAttributes: false,
        attributeNamePrefix: "",
        parseAttributeValue: true,
        // Keep these nodes content as raw HTML/XML markup
        stopNodes: [
            "*.fos:summary",
            "*.fos:rules",
            "*.fos:errors",
            "*.fos:notes",
            "*.fos:examples",
            "*.fos:properties",
        ],
        // Ensure these tags are always parsed as arrays to make structural mapping consistent
        isArray: (name) => {
            return ["fos:function", "fos:proto", "fos:arg"].includes(name);
        },
    });

    const parsed = parser.parse(xmlText);
    const functionsContainer = parsed["fos:functions"];
    if (!functionsContainer) {
        throw new Error("Invalid XML: Root element <fos:functions> not found.");
    }

    const functionsList = functionsContainer["fos:function"] as XmlFunction[];
    if (!functionsList || !Array.isArray(functionsList)) {
        throw new Error("Invalid XML: No <fos:function> elements found under root.");
    }

    console.log(`Found ${functionsList.length} function definitions. Extracting details...`);

    const catalog: Record<string, FunctionEntry> = {};

    for (const func of functionsList) {
        const name = func.name;
        const prefix = func.prefix;
        if (!name || !prefix) {
            continue;
        }

        const key = `${prefix}:${name}`;

        // Extract signatures from <fos:proto>
        const protoList = func["fos:signatures"]?.["fos:proto"] || [];
        const signatures: Signature[] = protoList.map((proto: XmlProto) => {
            const returnType = proto["return-type"] || "";
            const argList = proto["fos:arg"] || [];

            const params: Parameter[] = argList.map((arg: XmlParameter) => {
                const param: Parameter = {
                    name: arg.name || "",
                    type: arg.type || "",
                };
                if (arg.default !== undefined) {
                    param.default = String(arg.default);
                }
                if (arg.usage !== undefined) {
                    param.usage = String(arg.usage);
                }
                return param;
            });

            return {
                params,
                returnType,
            };
        });

        if (catalog[key]) {
            // Merge signatures if the function has duplicate declarations
            catalog[key].signatures.push(...signatures);
        } else {
            catalog[key] = {
                name,
                prefix,
                summary: cleanXmlContent(func["fos:summary"]),
                signatures,
            };

            const rules = cleanXmlContent(func["fos:rules"]);
            if (rules) catalog[key].rules = rules;

            const errors = cleanXmlContent(func["fos:errors"]);
            if (errors) catalog[key].errors = errors;

            const notes = cleanXmlContent(func["fos:notes"]);
            if (notes) catalog[key].notes = notes;

            const examples = parseExamples(func["fos:examples"]);
            if (examples) catalog[key].examples = examples;

            const properties = parseProperties(func["fos:properties"]);
            if (properties && properties.length > 0) catalog[key].properties = properties;
        }
    }

    // Ensure assets directory exists
    const assetsDir = path.dirname(OUTPUT_FILE_PATH);
    await fs.mkdir(assetsDir, { recursive: true });

    console.log(`Writing output to ${OUTPUT_FILE_PATH}...`);
    await fs.writeFile(OUTPUT_FILE_PATH, JSON.stringify(catalog, null, 4), "utf-8");
    console.log(
        `Successfully generated function catalog with ${Object.keys(catalog).length} entries!`,
    );
}

main().catch((err) => {
    console.error("Error occurred while generating function catalog:", err);
    process.exit(1);
});
