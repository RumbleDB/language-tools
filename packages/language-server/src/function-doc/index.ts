import { defaultNamespaces } from "server/analysis/default-namespaces.js";
import { QName, QNameToString } from "server/analysis/names.js";

import { getFunctionDocs } from "./loader.js";
import type { FunctionEntry, Parameter, Signature } from "./types.js";

export type { FunctionEntry, Parameter, Signature };

export function getBuiltinFunctionDocumentation(name: QName): FunctionEntry | undefined {
    const docs = getFunctionDocs();
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
