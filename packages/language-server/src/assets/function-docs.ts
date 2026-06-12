export type Parameter = {
    name: string;
    type: string;
    default?: string;
    usage?: string;
};

export type Signature = {
    params: Parameter[];
    returnType: string;
};

export type FunctionDocEntry = {
    name: string;
    prefix: string;
    summary: string;
    rules?: string;
    errors?: string;
    notes?: string;
    examples?: string;
    properties?: string[];
    signatures: Signature[];
};

import { defaultNamespaces } from "server/analysis/default-namespaces.js";
import { QName, QNameToString } from "server/analysis/names.js";

import { loadJsonAsset } from "./loader.js";

const FILES_TO_LOAD = ["function-doc/w3-functions.json", "function-doc/custom-functions.json"];
export const docs: Record<string, FunctionDocEntry> = {};

FILES_TO_LOAD.map(loadJsonAsset<Record<string, FunctionDocEntry>>).forEach((doc) => {
    if (doc == null) return;

    for (const [originalKey, value] of Object.entries(doc)) {
        const [prefix, localName] = originalKey.split(":");
        const namespace = defaultNamespaces.get(prefix!);
        if (!namespace) {
            continue;
        }
        const key = QNameToString({ localName: localName!, namespaceUri: namespace }, true);
        docs[key] = value;
    }
});

export function getBuiltinFunctionDocumentation(name: QName): FunctionDocEntry | undefined {
    let key = QNameToString(name, true);

    if (name.namespaceUri === undefined) {
        /// Try to resolve with different default namespace Uris
        for (const ns of defaultNamespaces.values()) {
            const tryKey = QNameToString(
                {
                    ...name,
                    namespaceUri: ns,
                },
                true,
            );

            if (docs[tryKey]) {
                key = tryKey;
                break;
            }
        }
    }

    const entry = docs[key];

    if (!entry) {
        console.warn(`No documentation found for function: ${key}`);
        return undefined;
    }

    return entry;
}

export function formatFunctionDocEntry(entry: FunctionDocEntry, arity?: number): string {
    const { prefix, name } = entry;
    // Format signatures
    const signatureStrings = entry.signatures.map((sig: Signature) => {
        const paramsStr = sig.params
            .map((p: Parameter) => {
                let str = `$${p.name}`;
                if (p.type) {
                    str += ` as ${p.type}`;
                }
                if (p.default !== undefined) {
                    str += ` = ${p.default}`;
                }
                return str;
            })
            .join(", ");
        const returnTypeStr = sig.returnType ? ` as ${sig.returnType}` : "";
        return `${prefix}:${name}(${paramsStr})${returnTypeStr}`;
    });

    let activeSignature = "";
    if (arity) {
        /// If arity is provided, try to find a signature that matches the arity
        const matchingSigIdx = entry.signatures.findIndex(
            (sig: Signature) => sig.params.length === arity,
        );
        if (matchingSigIdx !== -1) {
            activeSignature = signatureStrings[matchingSigIdx] ?? "";
        }
    } else {
        /// If arity is not provided, show all of them
        activeSignature = signatureStrings.join("\n");
    }

    const lines = ["```jsoniq", activeSignature || `${prefix}:${name}#${arity ?? "?"}`, "```"];

    if (entry.summary) {
        lines.push("", entry.summary);
    }

    if (entry.properties && entry.properties.length > 0) {
        const propsStr = entry.properties.map((p: string) => `_${p}_`).join(" · ");
        lines.push("", `Properties: ${propsStr}`);
    }

    if (entry.rules) {
        lines.push("", "**Rules:**", entry.rules);
    }

    if (entry.errors) {
        lines.push("", "**Errors:**", entry.errors);
    }

    if (entry.notes) {
        lines.push("", "**Notes:**", entry.notes);
    }

    if (entry.examples) {
        lines.push("", "**Examples:**", entry.examples);
    }

    return lines.join("\n");
}
