import { buildDocumentIndex } from "server/analysis/document-index.js";
import { resolveModuleLocations } from "server/workspace/module-resolver.js";
import type { DocumentLink } from "vscode-languageserver";
import type { TextDocument } from "vscode-languageserver-textdocument";

export function collectDocumentLinks(document: TextDocument): DocumentLink[] {
    const index = buildDocumentIndex(document);
    return index.moduleDeclaration.imports.flatMap((imported) =>
        resolveModuleLocations(document.uri, imported).flatMap(({ range, targetUri }) =>
            targetUri?.startsWith("file:") === true ? [{ range, target: targetUri }] : [],
        ),
    );
}
