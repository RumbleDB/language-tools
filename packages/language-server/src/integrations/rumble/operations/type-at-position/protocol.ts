import type { QName, SequenceType } from "server/analysis/index.js";
import type { WrapperRequestSpec } from "server/integrations/rumble/protocol.js";
import type { Position, Range } from "vscode-languageserver";

export const REQUEST_TYPE_TYPE_AT_POSITION = "type-at-position" as const;

export interface TypeAtPositionRequest {
    requestType: typeof REQUEST_TYPE_TYPE_AT_POSITION;
    body: string;
    documentUri: string;
    position: Position;
    pathSteps?: PathStepScope;
}

/**
 * Which path steps to list: those that select children or attributes of each item, as after `/`, or also of each of
 * its descendants, as after `//`.
 */
export type PathStepScope = "children" | "descendants";

export interface TypeAtPositionWireResult {
    sequenceType?: SequenceType;
    range?: Range;
    /** Child elements that the schema declares for the requested path steps, ignoring wildcards. */
    children?: PathStep[];
    /** Attributes that the schema declares for the requested path steps, ignoring wildcards. */
    attributes?: PathStep[];
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
