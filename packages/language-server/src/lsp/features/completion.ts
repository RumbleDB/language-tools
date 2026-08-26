import type { WrapperClient } from "server/integrations/rumble/client.js";
import type { ParserService } from "server/parser/index.js";
import type { WorkspaceService } from "server/workspace/service.js";
import type { CompletionItem, Position } from "vscode-languageserver";
import type { TextDocument } from "vscode-languageserver-textdocument";

import { createCompletionContext } from "./completion/context.js";
import { finalizeCompletionItems } from "./completion/finalize.js";
import {
    provideBuiltinFunctionCompletions,
    provideBuiltinTypeCompletions,
} from "./completion/providers/builtins.js";
import {
    provideSourceFunctionCompletions,
    provideSourceTypeCompletions,
    provideVariableCompletions,
} from "./completion/providers/declarations.js";
import { provideErrorCodeCompletions } from "./completion/providers/error-codes.js";
import { provideKeywordCompletions } from "./completion/providers/keywords.js";
import { provideObjectFieldCompletions } from "./completion/providers/object-fields.js";
import { provideVariableDeclarationCompletions } from "./completion/providers/variable-declaration.js";
import type { CompletionProvider } from "./completion/types.js";
import type { FeatureRegistrationContext } from "./context.js";

const exclusiveProviders: CompletionProvider[] = [
    provideErrorCodeCompletions,
    provideVariableDeclarationCompletions,
    provideObjectFieldCompletions,
];

const additiveProviders: CompletionProvider[] = [
    provideVariableCompletions,
    provideSourceFunctionCompletions,
    provideBuiltinFunctionCompletions,
    provideSourceTypeCompletions,
    provideBuiltinTypeCompletions,
    provideKeywordCompletions,
];

export function registerCompletion({
    connection,
    documents,
    parser,
    workspace,
    wrapper,
}: FeatureRegistrationContext): void {
    connection.onCompletion(async (params) => {
        const document = documents.get(params.textDocument.uri);
        return document === undefined
            ? []
            : await findCompletions(document, params.position, parser, workspace, wrapper);
    });
}

export async function findCompletions(
    document: TextDocument,
    position: Position,
    parser: ParserService,
    workspace: WorkspaceService,
    wrapper: WrapperClient,
): Promise<CompletionItem[]> {
    const context = createCompletionContext(document, position, parser, workspace, wrapper);
    if (context === null) {
        return [];
    }

    for (const provider of exclusiveProviders) {
        const items = await provider(context);
        if (items !== null) {
            return finalizeCompletionItems(items);
        }
    }

    const additiveItems = await Promise.all(additiveProviders.map((provider) => provider(context)));

    return finalizeCompletionItems(
        additiveItems.filter((items): items is CompletionItem[] => items !== null).flat(),
    );
}
