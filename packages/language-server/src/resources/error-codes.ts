import { loadJsonAsset } from "./loader.js";

export interface ErrorCodeEntry {
    code: string;
    description: string;
    category: string;
    specificationUrl: string;
}

export const errorCodes =
    loadJsonAsset<Record<string, ErrorCodeEntry>>("error-doc/w3-errors.json") ?? {};
