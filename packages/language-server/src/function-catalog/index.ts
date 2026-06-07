import { definitionNameToString } from "server/analysis/model.js";
import type { BuiltinFunctionDefinition } from "server/wrapper/builtin-functions.js";

import { getW3Catalog } from "./loader.js";
import type { FunctionEntry, Parameter, Signature } from "./types.js";

export type { FunctionEntry, Parameter, Signature };

interface BuiltinDocumentationOptions {
    preferMatchingArity?: boolean;
}

export function getBuiltinFunctionHover(declaration: BuiltinFunctionDefinition): string {
    return getBuiltinFunctionDocumentation(declaration, { preferMatchingArity: true });
}

export function getBuiltinFunctionDocumentation(
    declaration: BuiltinFunctionDefinition,
    options: BuiltinDocumentationOptions = {},
): string {
    const qname = declaration.name.qname;
    const prefix = qname.prefix || "fn";
    const localName = qname.localName;
    const arity = declaration.name.arity;
    const key = `${prefix}:${localName}`;

    const catalog = getW3Catalog();
    const entry = catalog[key];

    if (entry !== undefined) {
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
            return `${prefix}:${localName}(${paramsStr})${returnTypeStr}`;
        });

        // Try to find matching signature based on arity
        let activeSignature = "";
        if (options.preferMatchingArity !== false && arity !== undefined) {
            const matchingSigIdx = entry.signatures.findIndex(
                (sig: Signature) => sig.params.length === arity,
            );
            if (matchingSigIdx !== -1) {
                activeSignature = signatureStrings[matchingSigIdx] ?? "";
            }
        }

        if (activeSignature === "" && signatureStrings.length > 0) {
            activeSignature = signatureStrings.join("\n");
        }

        const lines = [
            "```jsoniq",
            activeSignature || `${prefix}:${localName}#${arity ?? "?"}`,
            "```",
        ];

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

    // Fallback 1: Format using the daemon's parameter types
    const sig = declaration.signature;
    if (sig !== undefined) {
        const paramsStr = sig.parameterTypes.map((t, idx) => `$arg${idx + 1} as ${t}`).join(", ");
        const returnTypeStr = sig.returnType ? ` as ${sig.returnType}` : "";
        const sigStr = `${prefix}:${localName}(${paramsStr})${returnTypeStr}`;
        return ["```jsoniq", sigStr, "```", `kind: \`builtin-function\``].join("\n");
    }

    // Fallback 2: Ultimate fallback
    const nameStr = definitionNameToString(declaration);
    return [
        "```jsoniq",
        nameStr,
        "```",
        `kind: \`${declaration.kind}\``,
        `(builtin function)`,
    ].join("\n");
}
