import { buildDocumentIndex } from "server/analysis/document-index.js";
import { resolveModuleLocations } from "server/workspace/module-resolver.js";
import type { DocumentLink } from "vscode-languageserver";
import type { TextDocument } from "vscode-languageserver-textdocument";

import type { FeatureRegistrationContext } from "./context.js";

export function registerDocumentLinks({ connection, documents }: FeatureRegistrationContext): void {
    connection.onDocumentLinks((params) => {
        const document = documents.get(params.textDocument.uri);
        return document === undefined ? [] : collectDocumentLinks(document);
    });
}

export function collectDocumentLinks(document: TextDocument): DocumentLink[] {
    const index = buildDocumentIndex(document);
    return index.moduleDeclaration.imports.flatMap((imported) =>
        resolveModuleLocations(document.uri, imported).flatMap(({ range, targetUri }) =>
            targetUri?.startsWith("file:") === true ? [{ range, target: targetUri }] : [],
        ),
    );
}
