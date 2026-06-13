import type { WrapperDaemonResponse, WrapperRequestSpec } from "./protocol.js";

export const REQUEST_TYPE_HANDSHAKE = "handshake" as const;

export interface HandshakeRequestPayload {
    requestType: typeof REQUEST_TYPE_HANDSHAKE;
}

export interface HandshakeResponseBody {
    rumbleVersion: string;
    rumbleCommit: string;
    rumbleCommitShort: string;
    rumbleRef: string;
}

export type HandshakeResponse = WrapperDaemonResponse<
    typeof REQUEST_TYPE_HANDSHAKE,
    HandshakeResponseBody
>;

export type HandshakeRequestSpec = WrapperRequestSpec<
    typeof REQUEST_TYPE_HANDSHAKE,
    HandshakeRequestPayload,
    HandshakeResponseBody
>;
