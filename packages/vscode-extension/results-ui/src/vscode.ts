declare global {
    function acquireVsCodeApi(): {
        postMessage(message: unknown): void;
        getState(): unknown;
        setState(state: unknown): void;
    };
}

class VsCodeApi {
    private vscodeApi = typeof acquireVsCodeApi === "function" ? acquireVsCodeApi() : undefined;

    public postMessage(message: unknown): void {
        if (this.vscodeApi) {
            this.vscodeApi.postMessage(message);
        } else {
            console.log("VSCode API postMessage:", message);
        }
    }

    public getState<T>(): T | undefined {
        return this.vscodeApi ? (this.vscodeApi.getState() as T) : undefined;
    }

    public setState<T>(state: T): void {
        if (this.vscodeApi) {
            this.vscodeApi.setState(state);
        }
    }
}

export const vscode = new VsCodeApi();
