import { ERR_NAMESPACE } from "server/analysis/model/default-namespaces.js";
import type { QName } from "server/analysis/model/names.js";

import { loadJsonAsset } from "./loader.js";

export interface ErrorCodeEntry {
    code: string;
    description: string;
    category: string;
    specificationUrl: string;
}

export const errorCodes =
    loadJsonAsset<Record<string, ErrorCodeEntry>>("error-doc/w3-errors.json") ?? {};

export function getErrorCodeEntry(name: QName): ErrorCodeEntry | undefined {
    return name.namespaceUri === ERR_NAMESPACE ? errorCodes[`err:${name.localName}`] : undefined;
}

export function formatErrorCodeDocumentation(entry: ErrorCodeEntry): string {
    return [
        `**${entry.code}** · ${entry.category} error`,
        "",
        entry.description,
        "",
        `[View the normative definition](${entry.specificationUrl})`,
    ].join("\n");
}
