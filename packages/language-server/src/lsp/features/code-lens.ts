import { config } from "server/app/configuration.js";
import type { ParserService } from "server/parser/index.js";
import type { CodeLens } from "vscode-languageserver";
import type { TextDocument } from "vscode-languageserver-textdocument";

import type { FeatureRegistrationContext } from "./context.js";

export function registerCodeLens({
    connection,
    documents,
    parser,
}: FeatureRegistrationContext): void {
    connection.onCodeLens((params) => {
        const document = documents.get(params.textDocument.uri);
        return document === undefined || !config.wrapper.enabled
            ? []
            : collectCodeLenses(document, parser);
    });
}

export function collectCodeLenses(document: TextDocument, parser: ParserService): CodeLens[] {
    if (document.getText().trim() === "") return [];

    const { ast } = parser.parse(document);
    if (ast.children.some((node) => node.kind === "module-declaration")) return [];

    return [
        {
            range: {
                start: { line: 0, character: 0 },
                end: { line: 0, character: 0 },
            },
            command: {
                title: "$(play) Run Query",
                command: "jsoniq.runQuery",
                arguments: [document.uri],
            },
        },
    ];
}
