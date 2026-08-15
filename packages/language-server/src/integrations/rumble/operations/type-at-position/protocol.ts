import type { SequenceType } from "server/analysis/type-system.js";
import type { Position, Range } from "vscode-languageserver";

import type { WrapperRequestSpec } from "../../protocol.js";

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
}

export type TypeAtPositionRequestSpec = WrapperRequestSpec<
    typeof REQUEST_TYPE_TYPE_AT_POSITION,
    TypeAtPositionRequest,
    TypeAtPositionWireResult
>;
