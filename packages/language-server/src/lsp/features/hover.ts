import type { RumbleWrapperClient } from "server/integrations/rumble/client.js";
import type { WorkspaceService } from "server/workspace/service.js";
import type { Hover, Position } from "vscode-languageserver";
import type { TextDocument } from "vscode-languageserver-textdocument";

import type { FeatureRegistrationContext } from "./context.js";
import { createHoverContext } from "./hover/context.js";
import { provideErrorCodeHover } from "./hover/providers/error-codes.js";
import { provideSemanticHover } from "./hover/providers/semantic.js";
import type { HoverProvider } from "./hover/types.js";

const hoverProviders: HoverProvider[] = [provideErrorCodeHover, provideSemanticHover];

export function registerHover({
    connection,
    documents,
    workspace,
    wrapper,
}: FeatureRegistrationContext): void {
    connection.onHover((params) => {
        const document = documents.get(params.textDocument.uri);
        return document === undefined
            ? null
            : findHover(document, params.position, workspace, wrapper);
    });
}

export async function findHover(
    document: TextDocument,
    position: Position,
    workspace: WorkspaceService,
    wrapper: RumbleWrapperClient,
): Promise<Hover | null> {
    const context = createHoverContext(document, position, workspace, wrapper);

    for (const provider of hoverProviders) {
        const hover = await provider(context);
        if (hover !== null) {
            return hover;
        }
    }

    return null;
}
