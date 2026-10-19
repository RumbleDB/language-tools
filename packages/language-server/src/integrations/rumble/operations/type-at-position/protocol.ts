import type { QName, SequenceType } from "server/analysis/index.js";
import type { WrapperRequestSpec } from "server/integrations/rumble/protocol.js";
import type { Position, Range } from "vscode-languageserver";

export const REQUEST_TYPE_TYPE_AT_POSITION = "type-at-position" as const;

export interface TypeAtPositionRequest {
    requestType: typeof REQUEST_TYPE_TYPE_AT_POSITION;
    body: string;
    documentUri: string;
    position: Position;
    pathSteps?: PathStepRequest | undefined;
}

/**
 * Which path steps to list: the child and attribute steps that select nodes of each item, as after `/`, or with
 * `throughDescendants` also of each of its descendants, as after `//`.
 */
export interface PathStepRequest {
    throughDescendants: boolean;
}

export interface TypeAtPositionWireResult {
    sequenceType?: SequenceType;
    range?: Range;
    /** The requested path steps that the schema declares, ignoring wildcards. */
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

export type TypeAtPositionRequestSpec = WrapperRequestSpec<
    typeof REQUEST_TYPE_TYPE_AT_POSITION,
    TypeAtPositionRequest,
    TypeAtPositionWireResult
>;
