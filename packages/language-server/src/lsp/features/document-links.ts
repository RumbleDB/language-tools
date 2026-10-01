import { collectModuleProlog } from "server/analysis/index.js";
import type { ParserService } from "server/parser/index.js";
import {
    resolveModuleLocations,
    resolveSchemaLocations,
} from "server/workspace/module-resolver.js";
import type { DocumentLink } from "vscode-languageserver";
import type { TextDocument } from "vscode-languageserver-textdocument";

import type { FeatureRegistrationContext } from "./context.js";

export function registerDocumentLinks({
    connection,
    documents,
    parser,
}: FeatureRegistrationContext): void {
    connection.onDocumentLinks((params) => {
        const document = documents.get(params.textDocument.uri);
        return document === undefined ? [] : collectDocumentLinks(document, parser);
    });
}

export function collectDocumentLinks(
    document: TextDocument,
    parser: ParserService,
): DocumentLink[] {
    const prolog = collectModuleProlog(document.uri, parser.parse(document).ast);
    const locations = [
        ...prolog.imports.flatMap((imported) => resolveModuleLocations(document.uri, imported)),
        ...prolog.schemaImports.flatMap((imported) =>
            resolveSchemaLocations(document.uri, imported, prolog.baseUri),
        ),
    ];
    return locations.flatMap(({ range, targetUri }) =>
        targetUri?.startsWith("file:") === true ? [{ range, target: targetUri }] : [],
    );
}
