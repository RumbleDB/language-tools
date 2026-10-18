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

/** The items of all providers that apply are combined. */
const allProviders: CompletionProvider[] = [
    provideErrorCodeCompletions,
    provideObjectFieldCompletions,
    providePathStepCompletions,
    provideContextItemStepCompletions,
    provideVariableCompletions,
    provideSourceFunctionCompletions,
    provideSchemaConstructorCompletions,
    provideBuiltinFunctionCompletions,
    provideSourceTypeCompletions,
    provideSchemaTypeCompletions,
    provideBuiltinTypeCompletions,
    provideKeywordCompletions,
];

/**
 * Characters that start a path step, so that schema-declared steps can be suggested as they are typed. Unlike other
 * triggers, they also appear outside paths, such as in arrays, so completions they trigger only consult the path step
 * providers.
 */
export const PATH_STEP_TRIGGER_CHARACTERS = ["/", "@", "["];

const pathStepProviders: CompletionProvider[] = [
    providePathStepCompletions,
    provideContextItemStepCompletions,
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

    const items = await Promise.all(providers.map((provider) => provider(context)));

    return finalizeCompletionItems(
        items
            .filter((providerItems): providerItems is CompletionItem[] => providerItems !== null)
            .flat(),
    );
}
