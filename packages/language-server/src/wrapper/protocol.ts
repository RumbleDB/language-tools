export type JsonValue = null | boolean | number | string | JsonValue[] | JsonObject;

export interface JsonObject {
    [key: string]: JsonValue;
}

export interface WrapperPosition extends JsonObject {
    line: number;
    character: number;
}

export interface WrapperError extends JsonObject {
    code: string;
    message: string;
    position: WrapperPosition | null;
}

export type WrapperRequestPayload<RequestType extends string = string> = {
    requestType: RequestType;
};

export interface WrapperRequestSpec<
    RequestType extends string,
    RequestPayload extends WrapperRequestPayload<RequestType>,
    ResponseBody,
> {
    requestType: RequestType;
    request: RequestPayload;
    response: ResponseBody;
}

export type WrapperDaemonRequest<
    RequestPayload extends WrapperRequestPayload = WrapperRequestPayload,
> = {
    id: number;
} & RequestPayload;

export type WrapperDaemonResponse<ResponseType extends string, ResponseBody> = {
    id: number;
    responseType: ResponseType;
    body: ResponseBody;
    error: WrapperError | null;
};
