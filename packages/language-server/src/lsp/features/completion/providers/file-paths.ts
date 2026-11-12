import { readdir, stat } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
    collectModuleProlog,
    findNodesThatContainPosition,
    type FunctionCallNode,
} from "server/analysis/index.js";
import { FN_NAMESPACE, JN_NAMESPACE } from "server/analysis/model/constants.js";
import { languageIdForWorkspacePath } from "server/workspace/files.js";
import { staticBaseUri } from "server/workspace/module-resolver.js";
import { CompletionItemKind, type Range } from "vscode-languageserver";

import { replaceRange } from "../context.js";
import type { CompletionContext, CompletionProvider } from "../types.js";

/**
 * The local names of the builtin functions whose first argument is the path of what they read, by namespace.
 * RumbleDB's signatures type these paths as any string, so they are listed here.
 */
const FILE_FUNCTIONS = new Map([
    [
        JN_NAMESPACE,
        new Set([
            "avro-file",
            "csv-file",
            "delta-file",
            "json-file",
            "json-lines",
            "libsvm-file",
            "local-text-file",
            "parquet-file",
            "root-file",
            "structured-json-file",
            "structured-json-lines",
            "text-file",
            "xml-files",
        ]),
    ],
    [
        FN_NAMESPACE,
        new Set([
            "doc",
            "json-doc",
            "unparsed-text",
            "unparsed-text-available",
            "unparsed-text-lines",
            "yaml-doc",
        ]),
    ],
]);

/** A string that is a path: where its relative paths start, and which entries it can name. */
interface PathString {
    readonly baseUri: string | undefined;
    accepts(entry: DirectoryEntry): boolean;
}

interface DirectoryEntry {
    readonly name: string;
    /** Whether it is a directory, or a link to one. */
    readonly isDirectory: boolean;
}

/**
 * The files and directories that a path in a string continues with, as in `json-lines("data/¦")` or
 * `import module namespace m = "urn:m" at "lib/¦"`.
 */
export const provideFilePathCompletions: CompletionProvider = async (context) => {
    const { stringStart } = context.intent;
    if (stringStart === undefined) {
        return null;
    }
    const pathString = await findPathString(context, stringStart);
    if (pathString === undefined) {
        return null;
    }

    // The directory is listed, and the name in it is replaced, so that the editor filters the entries by that name.
    const { source, cursorOffset } = context;
    const typed = source.slice(stringStart + 1, cursorOffset);
    const directory = typed.slice(0, typed.lastIndexOf("/") + 1);
    const name = typed.slice(directory.length);
    const nameStart = cursorOffset - name.length;
    const nameEnd = endOfName(source, cursorOffset, source[stringStart]!);

    const entries = (await listDirectory(directory, pathString.baseUri)).filter(
        // Hidden entries, such as `.git`, show only once their name is being typed.
        (entry) =>
            pathString.accepts(entry) && (!entry.name.startsWith(".") || name.startsWith(".")),
    );
    return entries.map(({ name, isDirectory }) => {
        const label = isDirectory ? `${name}/` : name;
        // A directory replaces the slash after the name too, which its label ends with.
        const end = isDirectory && source[nameEnd] === "/" ? nameEnd + 1 : nameEnd;
        return {
            label,
            kind: isDirectory ? CompletionItemKind.Folder : CompletionItemKind.File,
            textEdit: replaceRange(context.document, nameStart, end, label),
            // The inserted slash is not typed, so it does not trigger completion for the directory's entries.
            ...(isDirectory
                ? { command: { title: "Suggest", command: "editor.action.triggerSuggest" } }
                : {}),
        };
    });
};

/** Where the name of a path that continues after the offset ends: at a slash, at the closing quote, or with the line. */
function endOfName(source: string, offset: number, quote: string): number {
    let end = offset;
    while (end < source.length && !["/", quote, "\n"].includes(source[end]!)) {
        end++;
    }
    return end;
}

/** What kind of path the string that starts at the offset is, if any. Relative paths resolve as RumbleDB does. */
async function findPathString(
    context: CompletionContext,
    stringStart: number,
): Promise<PathString | undefined> {
    const { document } = context;
    const startsTheString = (range: Range) => document.offsetAt(range.start) === stringStart;
    const prolog = collectModuleProlog(document.uri, context.getParseResult().ast);

    // A module is located relative to the module that imports it, and by its namespace when no location is given.
    const moduleLocations = prolog.imports.flatMap((imported) =>
        imported.locations.length === 0
            ? [imported.namespaceUriRange]
            : imported.locations.map(({ range }) => range),
    );
    if (moduleLocations.some(startsTheString)) {
        return {
            baseUri: document.uri,
            accepts: (entry) =>
                entry.isDirectory || languageIdForWorkspacePath(entry.name) !== undefined,
        };
    }

    // Schemas and the files that functions read are located relative to the static base URI.
    const anyEntry = { baseUri: staticBaseUri(document.uri, prolog.baseUri), accepts: () => true };
    const schemaLocations = prolog.schemaImports.flatMap((imported) =>
        imported.locations.map(({ range }) => range),
    );
    if (schemaLocations.some(startsTheString)) {
        return anyEntry;
    }
    const [call, argument] = findNodesThatContainPosition(
        await context.getAnalysis(),
        document.positionAt(context.cursorOffset),
    ).slice(-2);
    return call?.kind === "function-call" &&
        argument?.kind === "argument" &&
        argument === call.arguments[0] &&
        startsTheString(argument.range) &&
        readsFiles(call)
        ? anyEntry
        : undefined;
}

function readsFiles(call: FunctionCallNode): boolean {
    const declaration = call.reference.resolution?.declaration;
    if (declaration?.origin !== "builtin") {
        return false;
    }
    const { namespaceUri, localName } = declaration.name.qname;
    return namespaceUri !== undefined && FILE_FUNCTIONS.get(namespaceUri)?.has(localName) === true;
}

/** The entries of a local directory, which is empty for a path that is not local or cannot be read. */
async function listDirectory(
    directory: string,
    baseUri: string | undefined,
): Promise<DirectoryEntry[]> {
    const directoryPath = localPath(directory === "" ? "." : directory, baseUri);
    if (directoryPath === undefined) {
        return [];
    }
    const entries = await readdir(directoryPath, { withFileTypes: true }).catch(() => []);
    return Promise.all(
        entries.map(async (entry) => ({
            name: entry.name,
            // A link describes only itself, so what it links to is looked up.
            isDirectory: entry.isSymbolicLink()
                ? await stat(path.join(directoryPath, entry.name)).then(
                      (target) => target.isDirectory(),
                      () => false,
                  )
                : entry.isDirectory(),
        })),
    );
}

/** The file system path of a URI reference, or undefined when it is not a local file. */
function localPath(reference: string, baseUri: string | undefined): string | undefined {
    try {
        const url = new URL(reference, baseUri);
        return url.protocol === "file:" ? fileURLToPath(url) : undefined;
    } catch {
        return undefined;
    }
}
