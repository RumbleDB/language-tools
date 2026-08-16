import { collectModulePreamble } from "server/analysis/module-preamble.js";
import type { ParserService } from "server/parser/index.js";
import { resolveModuleLocations } from "server/workspace/module-resolver.js";
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
    const preamble = collectModulePreamble(document.uri, parser.parse(document).ast);
    return preamble.imports.flatMap((imported) =>
        resolveModuleLocations(document.uri, imported).flatMap(({ range, targetUri }) =>
            targetUri?.startsWith("file:") === true ? [{ range, target: targetUri }] : [],
        ),
    );
}
