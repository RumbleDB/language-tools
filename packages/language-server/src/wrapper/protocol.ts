export interface WrapperError {
    code: string;
    message: string;
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
