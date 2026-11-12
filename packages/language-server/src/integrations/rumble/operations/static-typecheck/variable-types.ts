import type { SequenceType } from "server/analysis/index.js";
import type { WrapperClient } from "server/integrations/rumble/client.js";
import type { CancellationToken, Disposable, Range } from "vscode-languageserver";
import type { TextDocument } from "vscode-languageserver-textdocument";

import { getStaticTypecheck } from "./service.js";

/** The variable types that the static typecheck of a document infers. */
export interface VariableTypes {
    /** The type of the variable whose name is at the range, as in its declaration. */
    typeOf(nameRange: Range): SequenceType | undefined;
    /** Whether RumbleDB is still checking the document, after which variables may be typed. */
    readonly isUpdating: boolean;
}

/**
 * The variable types of the document, when RumbleDB checks it before the wait is over and before the request is
 * cancelled. The check is shared with diagnostics.
 */
export async function getVariableTypes(
    document: TextDocument,
    wrapper: WrapperClient,
    options: { waitMs: number; token?: CancellationToken | undefined },
): Promise<VariableTypes> {
    const { version } = document;
    const typecheck = await waitAtMost(getStaticTypecheck(document, wrapper), options);
    // The document is updated in place, so it may have changed while RumbleDB checked it.
    const checked = document.version === version ? typecheck?.body.bindings : undefined;
    // RumbleDB's range of a name includes the `$`, so only where it ends is the same as in the declaration.
    const byNameEnd = new Map(
        (checked ?? []).map(({ range, sequenceType }) => [
            document.offsetAt(range.end),
            sequenceType,
        ]),
    );
    return {
        typeOf: (nameRange) => byNameEnd.get(document.offsetAt(nameRange.end)),
        isUpdating: checked === undefined,
    };
}

/** What the promise gives, or `undefined` when the wait is over or the request is cancelled first. */
async function waitAtMost<T>(
    promise: Promise<T>,
    { waitMs, token }: { waitMs: number; token?: CancellationToken | undefined },
): Promise<T | undefined> {
    let timeout: NodeJS.Timeout | undefined;
    let cancellation: Disposable | undefined;
    const givenUp = new Promise<undefined>((resolve) => {
        timeout = setTimeout(() => resolve(undefined), waitMs);
        cancellation = token?.onCancellationRequested(() => resolve(undefined));
    });
    try {
        return await Promise.race([promise, givenUp]);
    } finally {
        clearTimeout(timeout);
        cancellation?.dispose();
    }
}
