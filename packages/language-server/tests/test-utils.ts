import { type Position } from "vscode-languageserver";
import { TextDocument } from "vscode-languageserver-textdocument";

type TestDocumentSource = string | string[];

interface BaseOptions {
    languageId?: string;
    version?: number;
}

interface UriOptions extends BaseOptions {
    uri: string;
}

function sourceText(source: TestDocumentSource): string {
    return Array.isArray(source) ? source.join("\n") : source;
}

export function testDocument(name: string, source: TestDocumentSource): TextDocument {
    return TextDocument.create(`file:///${name}.jq`, "jsoniq", 1, sourceText(source));
}

export function testDocumentFromUri(source: TestDocumentSource, options: UriOptions): TextDocument {
    const { uri, languageId = "jsoniq", version = 1 } = options;
    return TextDocument.create(uri, languageId, version, sourceText(source));
}

/**
 * Finds the position of the first occurrence of the given string in the document.
 * @param document The TextDocument to search within
 * @param needle The string to find in the document
 * @returns The Position of the first occurrence of the string in the document, or throws an error if the string is not found
 */
export function positionAt(document: TextDocument, needle: string): Position {
    const offset = document.getText().indexOf(needle);
    if (offset < 0) {
        throw new Error(`Could not find '${needle}' in document.`);
    }

    return document.positionAt(offset);
}

/**
 * Finds the position of the nth occurrence of the given string in the document.
 * @param document The TextDocument to search within
 * @param needle The string to find in the document
 * @param occurrence The 0-based index of the occurrence to find
 * @returns The Position of the nth occurrence of the string in the document, or throws an error if the string is not found
 */
export function positionAtNth(
    document: TextDocument,
    needle: string,
    occurrence: number,
): Position {
    const source = document.getText();
    let offset = -1;
    let fromIndex = 0;

    for (let index = 0; index <= occurrence; index += 1) {
        offset = source.indexOf(needle, fromIndex);
        if (offset < 0) {
            throw new Error(`Could not find occurrence #${occurrence} for '${needle}'.`);
        }
        fromIndex = offset + needle.length;
    }

    return document.positionAt(offset);
}

export function createMockWrapperClient(
    overrides: Partial<import("server/integrations/rumble/client.js").WrapperClient> = {},
): import("server/integrations/rumble/client.js").WrapperClient {
    return {
        isUsable: () => true,
        getUnavailableError: () => null,
        sendRequest: async () => ({ id: 0, responseType: "", body: {}, error: null }),
        ...overrides,
    };
}
