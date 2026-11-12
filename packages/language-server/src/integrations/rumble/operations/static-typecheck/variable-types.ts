import type { SequenceType } from "server/analysis/index.js";
import type { WrapperClient } from "server/integrations/rumble/client.js";
import type { CancellationToken, Disposable, Range } from "vscode-languageserver";
import { TextDocument } from "vscode-languageserver-textdocument";

import {
    getCachedStaticTypecheck,
    getStaticTypecheck,
    type CachedStaticTypecheck,
} from "./service.js";

/** The variable types that the latest static typecheck of a document inferred. */
export interface VariableTypes {
    /** The type of the variable whose name is at the range, as in its declaration. */
    typeOf(nameRange: Range): SequenceType | undefined;
    /** Whether RumbleDB is checking the document, after which the types may change. */
    readonly isUpdating: boolean;
}

/** A checked binding, by the offset where its name ends in the checked version. */
type BindingsByNameEnd = Map<number, { name: string; sequenceType: SequenceType }>;

const indexed = new WeakMap<CachedStaticTypecheck, BindingsByNameEnd>();

/**
 * The variable types of the current version of the document, or when RumbleDB takes longer than the wait or the
 * request is cancelled, of the newest version that it has checked. That version may be older, so a binding only types
 * a variable of the same name whose name ends at the same offset. Names before an edit do not move, and the name
 * guards against those after it.
 */
export async function getVariableTypes(
    document: TextDocument,
    wrapper: WrapperClient,
    options: { waitMs: number; token?: CancellationToken | undefined },
): Promise<VariableTypes> {
    // The check of the current version is shared with diagnostics, and kept when it succeeds.
    const checked = await waitAtMost(getStaticTypecheck(document, wrapper), options);
    const latest = getCachedStaticTypecheck(document.uri);
    const bindings = latest === undefined ? undefined : indexBindings(latest);
    return {
        typeOf(nameRange) {
            const binding = bindings?.get(document.offsetAt(nameRange.end));
            return binding?.name === unsigiled(document.getText(nameRange))
                ? binding.sequenceType
                : undefined;
        },
        isUpdating: !checked,
    };
}

/** Whether the promise settles before the wait is over and before the request is cancelled. */
async function waitAtMost(
    promise: Promise<unknown>,
    { waitMs, token }: { waitMs: number; token?: CancellationToken | undefined },
): Promise<boolean> {
    let timeout: NodeJS.Timeout | undefined;
    let cancellation: Disposable | undefined;
    const givenUp = new Promise<false>((resolve) => {
        timeout = setTimeout(() => resolve(false), waitMs);
        cancellation = token?.onCancellationRequested(() => resolve(false));
    });
    try {
        return await Promise.race([promise.then(() => true), givenUp]);
    } finally {
        clearTimeout(timeout);
        cancellation?.dispose();
    }
}

function indexBindings(typecheck: CachedStaticTypecheck): BindingsByNameEnd {
    let bindings = indexed.get(typecheck);
    if (bindings === undefined) {
        const checked = TextDocument.create("", "", typecheck.version, typecheck.source);
        bindings = new Map(
            typecheck.response.body.bindings.map(({ range, sequenceType }) => [
                checked.offsetAt(range.end),
                { name: unsigiled(checked.getText(range)), sequenceType },
            ]),
        );
        indexed.set(typecheck, bindings);
    }
    return bindings;
}

/** The name without the `$` that RumbleDB includes in its ranges. */
function unsigiled(name: string): string {
    return name.startsWith("$") ? name.slice(1) : name;
}
