export interface RequestClient {
    sendRequest<R>(method: string, param: unknown): Promise<R>;
}
