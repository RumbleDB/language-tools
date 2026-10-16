import type { QName, SequenceType } from "server/analysis/index.js";
import type { WrapperRequestSpec } from "server/integrations/rumble/protocol.js";
import type { Position, Range } from "vscode-languageserver";

export const REQUEST_TYPE_TYPE_AT_POSITION = "type-at-position" as const;

export interface TypeAtPositionRequest {
    requestType: typeof REQUEST_TYPE_TYPE_AT_POSITION;
    body: string;
    documentUri: string;
    position: Position;
    pathSteps?: PathStepRequest;
}

/**
 * Which path steps to list: those on the axis that select nodes of each item, as after `/`, or with
 * `throughDescendants` also of each of its descendants, as after `//`.
 */
export interface PathStepRequest {
    axis: "child" | "attribute";
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
    sequenceType?: SequenceType;
}

export type TypeAtPositionRequestSpec = WrapperRequestSpec<
    typeof REQUEST_TYPE_TYPE_AT_POSITION,
    TypeAtPositionRequest,
    TypeAtPositionWireResult
>;
