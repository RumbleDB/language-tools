import { ChildProcessWithoutNullStreams, spawn } from "node:child_process";

import pidusage from "pidusage";
import { config } from "server/app/configuration.js";
import { createLogger } from "server/utils/logger.js";

import { type WrapperResolutionOptions, resolveWrapperLaunchConfig } from "./executable/index.js";
import { REQUEST_TYPE_HANDSHAKE, type HandshakeRequestSpec } from "./handshake.js";
import { ensureJavaAvailable } from "./java.js";
import type {
    WrapperDaemonRequest,
    WrapperDaemonResponse,
    WrapperRequestPayload,
    WrapperRequestSpec,
} from "./protocol.js";

type AnyWrapperRequestSpec = WrapperRequestSpec<string, WrapperRequestPayload, object>;
type AnyWrapperResponse = WrapperDaemonResponse<string, object>;
const logger = createLogger("wrapper:client");

interface PendingRequest {
    expectedResponseType: string;
    resolve: (response: AnyWrapperResponse) => void;
    reject: (error: Error) => void;
    timeout: NodeJS.Timeout | undefined;
    signal: AbortSignal | undefined;
    onAbort?: () => void;
}

export type WrapperMemoryUsage = {
    pid: number;
    rssBytes: number;
};

export interface WrapperClient {
    isConfiguredEnabled?(): boolean;
    isUsable(): boolean;
    getUnavailableError(): Error | null;
    connect?(): Promise<void>;
    restart?(): Promise<void>;
    sendRequest<Spec extends AnyWrapperRequestSpec>(
        payload: Spec["request"],
        timeoutMs?: number,
        signal?: AbortSignal,
    ): Promise<WrapperDaemonResponse<Spec["requestType"], Spec["response"]>>;
    dispose?(): void;
    getRumbleVersion?(): string | null;
    getRumbleCommit?(): string | null;
    getRumbleCommitShort?(): string | null;
    getRumbleRef?(): string | null;
    getMemoryUsage?(): Promise<WrapperMemoryUsage | null>;
    setResolutionOptions?(options: WrapperResolutionOptions): void;
}

export class RumbleWrapperClient implements WrapperClient {
    private child: ChildProcessWithoutNullStreams | undefined;
    private nextRequestId = 1;
    private stdoutBuffer = "";
    private readonly pending = new Map<number, PendingRequest>();
    private processReadyPromise: Promise<void> | undefined;
    private handshakeCompleted = false;
    private rumbleVersion: string | null = null;
    private rumbleCommit: string | null = null;
    private rumbleCommitShort: string | null = null;
    private rumbleRef: string | null = null;
    private unavailableError: Error | null = null;

    public constructor(private resolutionOptions: WrapperResolutionOptions = {}) {}

    public setResolutionOptions(options: WrapperResolutionOptions): void {
        this.resolutionOptions = { ...this.resolutionOptions, ...options };
    }

    public isConfiguredEnabled(): boolean {
        return config.wrapper.enabled;
    }

    public isUsable(): boolean {
        return this.isConfiguredEnabled() && this.unavailableError === null;
    }

    public getUnavailableError(): Error | null {
        return this.unavailableError;
    }

    public async connect(): Promise<void> {
        if (!this.isConfiguredEnabled()) {
            throw new Error("LSP wrapper is disabled.");
        }

        if (this.unavailableError !== null) {
            throw this.unavailableError;
        }

        if (this.child !== undefined && this.handshakeCompleted) {
            return;
        }

        if (this.processReadyPromise !== undefined) {
            return await this.processReadyPromise;
        }

        this.processReadyPromise = this.startAndHandshake();
        try {
            await this.processReadyPromise;
        } catch (error) {
            const normalizedError = error instanceof Error ? error : new Error(String(error));
            this.markUnavailable(normalizedError);
            throw normalizedError;
        } finally {
            this.processReadyPromise = undefined;
        }
    }

    private async startAndHandshake(): Promise<void> {
        if (this.child === undefined) {
            await ensureJavaAvailable();
            const launchConfig = await resolveWrapperLaunchConfig(this.resolutionOptions);
            logger.info(`Launching wrapper with args: ${launchConfig.args.join(" ")}`);

            const child = spawn("java", launchConfig.args, {
                stdio: "pipe",
            });
            this.child = child;

            this.handshakeCompleted = false;
            child.stdout.setEncoding("utf8");
            child.stderr.setEncoding("utf8");
            child.stdout.on("data", (chunk: string) => {
                if (this.child !== child) return;
                this.handleStdoutChunk(chunk);
            });
            child.stderr.on("data", (chunk: string) => {
                if (this.child !== child) return;
                this.handleStderrChunk(chunk);
            });

            child.on("error", (error) => {
                logger.error("Wrapper process error:", error);
                if (this.child !== child) return;
                this.rejectAllPending(error);
                this.child = undefined;
                this.stdoutBuffer = "";
                this.handshakeCompleted = false;
            });

            child.on("close", () => {
                logger.warn("Wrapper process closed.");
                if (this.child !== child) return;

                this.rejectAllPending(new Error("Wrapper process closed."));
                this.child = undefined;
                this.stdoutBuffer = "";
                this.handshakeCompleted = false;
            });
        }

        try {
            const handshakeResponse = await this.sendRequestInternal<HandshakeRequestSpec>(
                {
                    requestType: REQUEST_TYPE_HANDSHAKE,
                },
                30_000,
            );

            this.rumbleVersion = handshakeResponse.body.rumbleVersion;
            this.rumbleCommit = handshakeResponse.body.rumbleCommit;
            this.rumbleCommitShort = handshakeResponse.body.rumbleCommitShort;
            this.rumbleRef = handshakeResponse.body.rumbleRef;
            this.handshakeCompleted = true;
            logger.info(
                `Handshake with wrapper successful. Response: ${JSON.stringify(handshakeResponse)}`,
            );
        } catch (error) {
            logger.error(
                "Handshake with wrapper failed:",
                error instanceof Error ? error : String(error),
            );
            this.dispose();
            throw error instanceof Error ? error : new Error(String(error));
        }
    }

    public dispose(): void {
        this.handshakeCompleted = false;
        this.rumbleVersion = null;
        this.rumbleCommit = null;
        this.rumbleCommitShort = null;
        this.rumbleRef = null;

        this.rejectAllPending(new Error("Wrapper client disposed."));

        if (this.child !== undefined) {
            this.child.kill();
            this.child = undefined;
        }
    }

    public async restart(): Promise<void> {
        logger.info("Restarting wrapper process.");
        this.dispose();
        this.unavailableError = null;
        await this.connect();
    }

    public async sendRequest<Spec extends AnyWrapperRequestSpec>(
        payload: Spec["request"],
        timeoutMs?: number,
        signal?: AbortSignal,
    ): Promise<WrapperDaemonResponse<Spec["requestType"], Spec["response"]>> {
        if (!this.isConfiguredEnabled()) {
            throw new Error("LSP wrapper is disabled.");
        }

        if (this.unavailableError !== null) {
            throw this.unavailableError;
        }

        await this.connect();
        return this.sendRequestInternal<Spec>(payload, timeoutMs, signal);
    }

    private markUnavailable(error: Error): void {
        if (this.unavailableError !== null) {
            return;
        }

        this.unavailableError = error;
        logger.warn(`Disabling wrapper for this session: ${error.message}`);
    }

    private async sendRequestInternal<Spec extends AnyWrapperRequestSpec>(
        payload: Spec["request"],
        timeoutMs?: number,
        signal?: AbortSignal,
    ): Promise<WrapperDaemonResponse<Spec["requestType"], Spec["response"]>> {
        const id = this.nextRequestId;
        this.nextRequestId += 1;

        const request: WrapperDaemonRequest<Spec["request"]> = {
            id,
            ...payload,
        };
        const encodedRequest = JSON.stringify(request);
        const child = this.child;

        logger.debug(`Sending request to wrapper: ${encodedRequest}`);

        if (child === undefined) {
            throw new Error("Wrapper process is not available.");
        }

        if (signal?.aborted === true) {
            throw signal.reason instanceof Error
                ? signal.reason
                : new Error("Operation was cancelled.");
        }

        return new Promise<WrapperDaemonResponse<Spec["requestType"], Spec["response"]>>(
            (resolve, reject) => {
                const timeout =
                    timeoutMs !== undefined
                        ? setTimeout(() => {
                              this.pending.delete(id);
                              reject(new Error("Wrapper timed out."));
                          }, timeoutMs)
                        : undefined;

                const onAbort = () => {
                    // Reject with AbortError before dispose() can reject it generically
                    const reason =
                        signal?.reason instanceof Error
                            ? signal.reason
                            : new Error("Operation was cancelled.");
                    this.rejectPending(id, reason);
                    // Kill the Java process so it's immediately free for the next request.
                    // Next sendRequest call will reconnect lazily via connect().
                    this.dispose();
                    this.unavailableError = null;
                };

                signal?.addEventListener("abort", onAbort, { once: true });

                this.pending.set(id, {
                    expectedResponseType: payload.requestType,
                    resolve: resolve as (response: AnyWrapperResponse) => void,
                    reject,
                    timeout,
                    signal,
                    onAbort,
                });

                try {
                    child.stdin.write(`${encodedRequest}\n`, "utf8", (error) => {
                        if (error !== undefined && error !== null) {
                            this.rejectPending(id, error);
                        }
                    });
                } catch (error) {
                    logger.error(
                        "Failed to write to wrapper stdin:",
                        error instanceof Error ? error : String(error),
                    );
                    this.rejectPending(
                        id,
                        error instanceof Error ? error : new Error("Wrapper write failed."),
                    );
                }
            },
        );
    }

    private handleStdoutChunk(chunk: string): void {
        this.stdoutBuffer += chunk;
        const lines = this.stdoutBuffer.split("\n");
        this.stdoutBuffer = lines.pop() ?? "";

        for (const line of lines) {
            const trimmed = line.trim();
            if (trimmed.length === 0 || !trimmed.startsWith("{")) {
                continue;
            }
            this.handleResponseLine(trimmed);
        }
    }

    private handleStderrChunk(chunk: string): void {
        const lines = chunk
            .split("\n")
            .map((line) => line.trim())
            .filter((line) => line.length > 0);

        for (const line of lines) {
            logger.warn(`Wrapper stderr: ${line}`);
        }
    }

    private handleResponseLine(line: string): void {
        const response = JSON.parse(line) as AnyWrapperResponse;
        const pendingRequest = this.pending.get(response.id);
        if (pendingRequest === undefined) {
            return;
        }

        if (pendingRequest.timeout !== undefined) {
            clearTimeout(pendingRequest.timeout);
        }
        if (pendingRequest.onAbort !== undefined) {
            pendingRequest.signal?.removeEventListener("abort", pendingRequest.onAbort);
        }
        this.pending.delete(response.id);

        logger.debug(`Received response from wrapper: ${JSON.stringify(response, null, 2)}`);

        if (response.responseType !== pendingRequest.expectedResponseType) {
            pendingRequest.reject(
                new Error(
                    `Wrapper returned responseType '${response.responseType}' for requestType '${pendingRequest.expectedResponseType}'.`,
                ),
            );
            return;
        }

        pendingRequest.resolve(response);
    }

    private rejectPending(id: number, error: Error): void {
        const pendingRequest = this.pending.get(id);
        if (pendingRequest === undefined) {
            return;
        }

        if (pendingRequest.timeout !== undefined) {
            clearTimeout(pendingRequest.timeout);
        }
        if (pendingRequest.onAbort !== undefined) {
            pendingRequest.signal?.removeEventListener("abort", pendingRequest.onAbort);
        }
        this.pending.delete(id);
        pendingRequest.reject(error);
    }

    private rejectAllPending(error: Error): void {
        for (const [id, pendingRequest] of this.pending.entries()) {
            if (pendingRequest.timeout !== undefined) {
                clearTimeout(pendingRequest.timeout);
            }
            if (pendingRequest.onAbort !== undefined) {
                pendingRequest.signal?.removeEventListener("abort", pendingRequest.onAbort);
            }
            pendingRequest.reject(error);
            this.pending.delete(id);
        }
    }

    public getRumbleVersion(): string | null {
        return this.rumbleVersion;
    }

    public getRumbleCommit(): string | null {
        return this.rumbleCommit;
    }

    public getRumbleCommitShort(): string | null {
        return this.rumbleCommitShort;
    }

    public getRumbleRef(): string | null {
        return this.rumbleRef;
    }

    public async getMemoryUsage(): Promise<WrapperMemoryUsage | null> {
        const pid = this.child?.pid;
        if (pid === undefined) {
            return null;
        }

        const stats = await pidusage(pid);

        return {
            pid,
            rssBytes: stats.memory,
        };
    }
}
