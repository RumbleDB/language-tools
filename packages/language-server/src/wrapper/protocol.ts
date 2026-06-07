import { Position } from "vscode-languageserver";

import type {
    BuiltinFunctionsRequestPayload,
    REQUEST_TYPE_BUILTIN_FUNCTIONS,
} from "./builtin-functions.js";
import type {
    HandshakeRequestPayload,
    HandshakeResponseBody,
    REQUEST_TYPE_HANDSHAKE,
} from "./handshake.js";
import type { InferTypesRequestPayload, REQUEST_TYPE_INFER_TYPES } from "./type-inference.js";
import type { BuiltinFunctionsResponseBody, TypeInferenceResult } from "./types.js";

export type WrapperRequestPayloadByType = {
    [REQUEST_TYPE_INFER_TYPES]: InferTypesRequestPayload;
    [REQUEST_TYPE_BUILTIN_FUNCTIONS]: BuiltinFunctionsRequestPayload;
    [REQUEST_TYPE_HANDSHAKE]: HandshakeRequestPayload;
};

export type WrapperRequestType = keyof WrapperRequestPayloadByType;

export type RequestPayloadByType = {
    [RequestType in WrapperRequestType]: WrapperRequestPayloadByType[RequestType];
};

export type WrapperRequestPayload<RequestType extends WrapperRequestType = WrapperRequestType> =
    WrapperRequestPayloadByType[RequestType];

export type WrapperDaemonRequest<RequestType extends WrapperRequestType = WrapperRequestType> = {
    id: number;
} & WrapperRequestPayloadByType[RequestType];

export type WrapperDaemonResponse<ResponseType extends WrapperRequestType, ResponseBody> = {
    id: number;
    responseType: ResponseType;
    body: ResponseBody;
    error: {
        code: string;
        message: string;
        position: Position | null;
    } | null;
};

export type WrapperResponseBodyByType = {
    [REQUEST_TYPE_INFER_TYPES]: TypeInferenceResult;
    [REQUEST_TYPE_BUILTIN_FUNCTIONS]: BuiltinFunctionsResponseBody;
    [REQUEST_TYPE_HANDSHAKE]: HandshakeResponseBody;
};
