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
import {
    provideContextItemStepCompletions,
    providePathStepCompletions,
} from "./completion/providers/path-steps.js";
import { provideSchemaConstructorCompletions } from "./completion/providers/schema-constructors.js";
import { provideSchemaTypeCompletions } from "./completion/providers/schema-types.js";
import type { CompletionProvider } from "./completion/types.js";
import type { FeatureRegistrationContext } from "./context.js";

interface CompletionProviders {
    /** The first that applies replaces all others. */
    exclusive: CompletionProvider[];
    /** Their items are combined. */
    additive: CompletionProvider[];
}

const allProviders: CompletionProviders = {
    exclusive: [
        provideErrorCodeCompletions,
        provideObjectFieldCompletions,
        providePathStepCompletions,
    ],
    additive: [
        provideContextItemStepCompletions,
        provideVariableCompletions,
        provideSourceFunctionCompletions,
        provideSchemaConstructorCompletions,
        provideBuiltinFunctionCompletions,
        provideSourceTypeCompletions,
        provideSchemaTypeCompletions,
        provideBuiltinTypeCompletions,
        provideKeywordCompletions,
    ],
};

/**
 * Characters that start a path step, so that schema-declared steps can be suggested as they are typed. Unlike other
 * triggers, they also appear outside paths, such as in arrays, so completions they trigger only consult the path step
 * providers.
 */
export const PATH_STEP_TRIGGER_CHARACTERS = ["/", "@", "["];

const pathStepProviders: CompletionProviders = {
    exclusive: [providePathStepCompletions],
    additive: [provideContextItemStepCompletions],
};

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
            : await findCompletions(
                  document,
                  params.position,
                  parser,
                  workspace,
                  wrapper,
                  params.context?.triggerCharacter,
              );
    });
}

export async function findCompletions(
    document: TextDocument,
    position: Position,
    parser: ParserService,
    workspace: WorkspaceService,
    wrapper: WrapperClient,
    triggerCharacter?: string,
): Promise<CompletionItem[]> {
    const context = createCompletionContext(document, position, parser, workspace, wrapper);
    if (context === null) {
        return [];
    }

    const providers =
        triggerCharacter !== undefined && PATH_STEP_TRIGGER_CHARACTERS.includes(triggerCharacter)
            ? pathStepProviders
            : allProviders;

    for (const provider of providers.exclusive) {
        const items = await provider(context);
        if (items !== null) {
            return finalizeCompletionItems(items);
        }
    }

    const additiveItems = await Promise.all(
        providers.additive.map((provider) => provider(context)),
    );

    return finalizeCompletionItems(
        additiveItems.filter((items): items is CompletionItem[] => items !== null).flat(),
    );
}
