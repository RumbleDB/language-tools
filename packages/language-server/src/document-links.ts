import type { DocumentLink } from "vscode-languageserver";
import type { TextDocument } from "vscode-languageserver-textdocument";

import { buildDocumentIndex } from "./analysis/document-index.js";
import { resolveModuleLocations } from "./analysis/module-loader.js";

export function collectDocumentLinks(document: TextDocument): DocumentLink[] {
    const index = buildDocumentIndex(document);
    return index.moduleDeclaration.imports.flatMap((imported) =>
        resolveModuleLocations(document.uri, imported).flatMap(({ range, targetUri }) =>
            targetUri?.startsWith("file:") === true ? [{ range, target: targetUri }] : [],
        ),
    );
}
