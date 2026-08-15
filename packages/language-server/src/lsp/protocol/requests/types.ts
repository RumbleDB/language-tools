export interface RequestClient {
    sendRequest<Result>(method: string, params: unknown): Promise<Result>;
}

export interface Request<Method extends string, Params, Result> {
    readonly method: Method;
    send(client: RequestClient, params: Params): Promise<Result>;
}

export function defineRequest<Method extends string, Params, Result>(
    method: Method,
): Request<Method, Params, Result> {
    return {
        method,
        send: (client, params) => client.sendRequest<Result>(method, params),
    };
}
