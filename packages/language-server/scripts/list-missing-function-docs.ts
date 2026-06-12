import { defaultNamespaces } from "../src/analysis/default-namespaces.js";
import { QNameToString } from "../src/analysis/names.js";
import { BuiltinFunctionDefinition, builtinFunctions } from "../src/assets/builtin-functions.js";
import { docs } from "../src/assets/function-docs.js";

const prefixByNamespace = new Map<string, string>([
    ["http://www.w3.org/2005/xpath-functions", "fn"],
    ["http://jsoniq.org/functions", "jn"],
    ["http://www.w3.org/2005/xpath-functions/math", "math"],
    ["http://www.w3.org/2005/xpath-functions/map", "map"],
    ["http://www.w3.org/2005/xpath-functions/array", "array"],
]);

function getFunctionPrefix(definition: BuiltinFunctionDefinition): string {
    const qname = definition.name.qname;
    if (qname.prefix !== undefined && qname.prefix.length > 0) {
        return qname.prefix;
    }
    if (qname.namespaceUri !== undefined) {
        return prefixByNamespace.get(qname.namespaceUri) ?? qname.namespaceUri;
    }
    return "fn";
}

function getFunctionKey(definition: BuiltinFunctionDefinition): string {
    return `${getFunctionPrefix(definition)}:${definition.name.qname.localName}`;
}

function getDocsKey(definition: BuiltinFunctionDefinition): string {
    const qname = definition.name.qname;
    const prefix = getFunctionPrefix(definition);
    const namespace = qname.namespaceUri ?? defaultNamespaces.get(prefix) ?? prefix;
    return QNameToString({ localName: qname.localName, namespaceUri: namespace }, true);
}

function formatSignature(definition: BuiltinFunctionDefinition): string {
    const params = definition.signature.parameterTypes
        .map((parameter, index) => `$arg${index + 1} as ${parameter.type}`)
        .join(", ");
    return `${getFunctionKey(definition)}(${params}) as ${definition.signature.returnType}`;
}

async function main(): Promise<void> {
    const missing = new Map<string, BuiltinFunctionDefinition[]>();

    for (const definition of builtinFunctions.all) {
        const key = getFunctionKey(definition);
        const docsKey = getDocsKey(definition);
        if (Object.hasOwn(docs, docsKey)) {
            continue;
        }

        const entries = missing.get(key);
        if (entries === undefined) {
            missing.set(key, [definition]);
        } else {
            entries.push(definition);
        }
    }

    const sortedEntries = [...missing.entries()].sort(([left], [right]) =>
        left.localeCompare(right),
    );

    console.log(`Function doc entries: ${Object.keys(docs).length}`);
    console.log(`Builtin overloads discovered: ${builtinFunctions.all.length}`);
    console.log(`Functions missing documentation: ${sortedEntries.length}`);

    if (sortedEntries.length === 0) {
        console.log("\nAll builtin functions currently have documentation entries.");
        return;
    }

    console.log("");
    for (const [key, definitions] of sortedEntries) {
        const arities = [...new Set(definitions.map((definition) => definition.name.arity ?? "?"))]
            .map(String)
            .sort((left, right) => left.localeCompare(right));
        console.log(
            `${key}  [${definitions.length} overload${definitions.length === 1 ? "" : "s"}; arities: ${arities.join(", ")}]`,
        );

        const signatures = [...new Set(definitions.map(formatSignature))].sort((left, right) =>
            left.localeCompare(right),
        );
        for (const signature of signatures) {
            console.log(`  - ${signature}`);
        }
    }
}

await main();
