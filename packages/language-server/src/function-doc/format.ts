import { FunctionEntry, Parameter, Signature } from "./types.js";

export function formatFunctionEntry(entry: FunctionEntry, arity?: number): string {
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
