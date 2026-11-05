import type { QName, SequenceType } from "server/analysis/index.js";
import type { WrapperRequestSpec } from "server/integrations/rumble/protocol.js";
import type { Position } from "vscode-languageserver";

export const REQUEST_TYPE_FOCUS_AT_POSITION = "focus-at-position" as const;

export interface FocusAtPositionRequest {
    requestType: typeof REQUEST_TYPE_FOCUS_AT_POSITION;
    body: string;
    documentUri: string;
    /** Right after the token that the lookup key or path step follows, such as `.`, `/`, `[` or `!`. */
    position: Position;
}

/** What a lookup key or path step at the position applies to. Empty when there is nothing to apply it to. */
export interface FocusAtPositionWireResult {
    sequenceType?: SequenceType;
    /** The path steps that the schema declares for the items, ignoring wildcards. Absent unless they are schema-typed. */
    pathSteps?: PathStep[];
}

/** A name that a path step can select, and the type of the nodes it selects from one item. */
export interface PathStep {
    name: QName;
    /** Whether the step selects attributes rather than children. */
    attribute: boolean;
    /** Absent when the schema does not determine the type. */
    sequenceType?: SequenceType;
}

export type FocusAtPositionRequestSpec = WrapperRequestSpec<
    typeof REQUEST_TYPE_FOCUS_AT_POSITION,
    FocusAtPositionRequest,
    FocusAtPositionWireResult
>;
