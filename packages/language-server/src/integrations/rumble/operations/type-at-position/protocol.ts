import type { QName, SequenceType } from "server/analysis/index.js";
import type { WrapperRequestSpec } from "server/integrations/rumble/protocol.js";
import type { Position, Range } from "vscode-languageserver";

export const REQUEST_TYPE_TYPE_AT_POSITION = "type-at-position" as const;

export interface TypeAtPositionRequest {
    requestType: typeof REQUEST_TYPE_TYPE_AT_POSITION;
    body: string;
    documentUri: string;
    position: Position;
}

export interface TypeAtPositionWireResult {
    sequenceType?: SequenceType;
    range?: Range;
    /** Child elements that the schema declares for the type's items, when it describes all of them. */
    children?: PathStep[];
    /** Attributes that the schema declares for the type's items, when it describes all of them. */
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
