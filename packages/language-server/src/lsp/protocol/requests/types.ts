import type { CancellationToken } from "vscode-languageserver/node";

export interface RequestClient {
    sendRequest<Result>(
        method: string,
        params: unknown,
        token?: CancellationToken,
    ): Promise<Result>;
}

export interface Request<Method extends string, Params, Result> {
    readonly method: Method;
    send(client: RequestClient, params: Params, token?: CancellationToken): Promise<Result>;
}

export function defineRequest<Method extends string, Params, Result>(
    method: Method,
): Request<Method, Params, Result> {
    return {
        method,
        send: (client, params, token) => client.sendRequest<Result>(method, params, token),
    };
}
