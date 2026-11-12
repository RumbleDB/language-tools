import type { SequenceType } from "server/analysis/index.js";
import type { WrapperClient } from "server/integrations/rumble/client.js";
import type { Range } from "vscode-languageserver";
import { TextDocument } from "vscode-languageserver-textdocument";

import { getLatestStaticTypecheck, type CachedStaticTypecheck } from "./service.js";

/** The variable types that the latest static typecheck of a document inferred. */
export interface VariableTypes {
    /** The type of the variable whose name is at the range, as in its declaration. */
    typeOf(nameRange: Range): SequenceType | undefined;
}

/** A checked binding, by the offset where its name ends in the checked version. */
type BindingsByNameEnd = Map<number, { name: string; sequenceType: SequenceType }>;

const indexed = new WeakMap<CachedStaticTypecheck, BindingsByNameEnd>();

/**
 * The variable types of the newest version of the document that RumbleDB has checked, without waiting for it. That
 * version may be older, so a binding only types a variable of the same name whose name ends at the same offset. Names
 * before an edit do not move, and the name guards against those after it.
 */
export function getLatestVariableTypes(
    document: TextDocument,
    wrapper: WrapperClient,
): VariableTypes | undefined {
    const typecheck = getLatestStaticTypecheck(document, wrapper);
    if (typecheck === undefined) {
        return undefined;
    }
    const bindings = indexBindings(typecheck);
    return {
        typeOf(nameRange) {
            const binding = bindings.get(document.offsetAt(nameRange.end));
            return binding?.name === unsigiled(document.getText(nameRange))
                ? binding.sequenceType
                : undefined;
        },
    };
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
