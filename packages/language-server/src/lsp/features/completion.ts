import type { WrapperClient } from "server/integrations/rumble/client.js";
import type { ParserService } from "server/parser/index.js";
import type { WorkspaceService } from "server/workspace/service.js";
import type {
    CancellationToken,
    CompletionItem,
    CompletionList,
    Position,
} from "vscode-languageserver";
import type { TextDocument } from "vscode-languageserver-textdocument";

import { createCompletionContext } from "./completion/context.js";
import { finalizeCompletionItems } from "./completion/finalize.js";
import {
    provideBuiltinFunctionCompletions,
    provideBuiltinTypeCompletions,
    resolveBuiltinFunctionCompletion,
} from "./completion/providers/builtins.js";
import {
    provideSourceFunctionCompletions,
    provideSourceTypeCompletions,
    provideVariableCompletions,
} from "./completion/providers/declarations.js";
import { provideErrorCodeCompletions } from "./completion/providers/error-codes.js";
import { provideKeywordCompletions } from "./completion/providers/keywords.js";
import { provideObjectFieldCompletions } from "./completion/providers/object-fields.js";
import { providePathStepCompletions } from "./completion/providers/path-steps.js";
import { provideSchemaConstructorCompletions } from "./completion/providers/schema-constructors.js";
import { provideSchemaTypeCompletions } from "./completion/providers/schema-types.js";
import type { CompletionProvider } from "./completion/types.js";
import type { FeatureRegistrationContext } from "./context.js";

/** The items of all providers that apply are combined. */
const allProviders: CompletionProvider[] = [
    provideErrorCodeCompletions,
    provideObjectFieldCompletions,
    providePathStepCompletions,
    provideVariableCompletions,
    provideSourceFunctionCompletions,
    provideSchemaConstructorCompletions,
    provideBuiltinFunctionCompletions,
    provideSourceTypeCompletions,
    provideSchemaTypeCompletions,
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
    connection.onCompletion(async (params, token) => {
        const document = documents.get(params.textDocument.uri);
        return document === undefined
            ? []
            : await findCompletionList(
                  document,
                  params.position,
                  parser,
                  workspace,
                  wrapper,
                  token,
              );
    });
    connection.onCompletionResolve(resolveCompletionItem);
}

/** Adds what is left out of the list to keep it small, such as the documentation of builtin functions. */
export function resolveCompletionItem(item: CompletionItem): CompletionItem {
    return resolveBuiltinFunctionCompletion(item) ?? item;
}

export async function findCompletions(
    document: TextDocument,
    position: Position,
    parser: ParserService,
    workspace: WorkspaceService,
    wrapper: WrapperClient,
): Promise<CompletionItem[]> {
    return (await findCompletionList(document, position, parser, workspace, wrapper)).items;
}

export async function findCompletionList(
    document: TextDocument,
    position: Position,
    parser: ParserService,
    workspace: WorkspaceService,
    wrapper: WrapperClient,
    token?: CancellationToken,
): Promise<CompletionList> {
    const context = createCompletionContext(document, position, parser, workspace, wrapper, token);
    if (context === null) {
        return { isIncomplete: false, items: [] };
    }

    const lists = (await Promise.all(allProviders.map((provider) => provider(context)))).map(
        (result) => (Array.isArray(result) ? { isIncomplete: false, items: result } : result),
    );

    return {
        isIncomplete: lists.some((list) => list?.isIncomplete === true),
        items: finalizeCompletionItems(
            lists.flatMap((list) => list?.items ?? []),
            context,
        ),
    };
}
