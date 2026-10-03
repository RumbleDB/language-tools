import type { ResultsRequest, ResultsResponse } from "../../src/shared/results-protocol.js";

declare global {
    function acquireVsCodeApi(): { postMessage(message: ResultsRequest): void };
}

const api = typeof acquireVsCodeApi === "function" ? acquireVsCodeApi() : undefined;

export const vscode = {
    postMessage<T extends ResultsRequest["type"]>(
        type: T,
        payload: Omit<Extract<ResultsRequest, { type: T }>, "type">,
    ): void {
        if (!api) throw new Error("This action requires the VSCode extension.");
        api.postMessage({ ...payload, type } as Extract<ResultsRequest, { type: T }>);
    },
    onMessage<T extends ResultsResponse["type"]>(
        type: T,
        listener: (message: Extract<ResultsResponse, { type: T }>) => void,
    ): () => void {
        const receive = (event: MessageEvent<ResultsResponse>) => {
            if (event.data.type === type) {
                listener(event.data as Extract<ResultsResponse, { type: T }>);
            }
        };
        window.addEventListener("message", receive);
        return () => window.removeEventListener("message", receive);
    },
};
