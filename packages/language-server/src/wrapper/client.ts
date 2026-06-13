import { ChildProcessWithoutNullStreams, spawn, execFile } from "node:child_process";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

import { config } from "server/config.js";
import { createLogger } from "server/utils/logger.js";

import { type WrapperResolutionOptions, resolveWrapperLaunchConfig } from "./executable/index.js";
import { REQUEST_TYPE_HANDSHAKE, type HandshakeRequestSpec } from "./handshake.js";
import type {
    WrapperDaemonRequest,
    WrapperDaemonResponse,
    WrapperRequestPayload,
    WrapperRequestSpec,
} from "./protocol.js";

type AnyWrapperRequestSpec = WrapperRequestSpec<string, WrapperRequestPayload, object>;
type AnyWrapperResponse = WrapperDaemonResponse<string, object>;
const logger = createLogger("wrapper:client");
let wrapperResolutionOptions: WrapperResolutionOptions = {};

interface PendingRequest {
    expectedResponseType: string;
    resolve: (response: AnyWrapperResponse) => void;
    reject: (error: Error) => void;
    timeout: NodeJS.Timeout;
}

export type WrapperMemoryUsage = {
    pid: number;
    rssBytes: number;
};

class RumbleWrapperClient {
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

    public isEnabled(): boolean {
        return config.wrapper.enabled;
    }

    public async connect(): Promise<void> {
        if (!this.isEnabled()) {
            throw new Error("LSP wrapper is disabled.");
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
        } finally {
            this.processReadyPromise = undefined;
        }
    }

    private async startAndHandshake(): Promise<void> {
        if (this.child === undefined) {
            const launchConfig = await resolveWrapperLaunchConfig(wrapperResolutionOptions);
            logger.info(`Launching wrapper with args: ${launchConfig.args.join(" ")}`);

            this.child = spawn("java", launchConfig.args, {
                stdio: "pipe",
            });

            this.handshakeCompleted = false;
            this.child.stdout.setEncoding("utf8");
            this.child.stderr.setEncoding("utf8");
            this.child.stdout.on("data", (chunk: string) => {
                this.handleStdoutChunk(chunk);
            });
            this.child.stderr.on("data", (chunk: string) => {
                this.handleStderrChunk(chunk);
            });

            this.child.on("error", (error) => {
                logger.error("Wrapper process error:", error);
                this.rejectAllPending(error);
                this.child = undefined;
                this.stdoutBuffer = "";
                this.handshakeCompleted = false;
            });

            this.child.on("close", () => {
                logger.warn("Wrapper process closed.");
                this.rejectAllPending(new Error("Wrapper process closed."));
                this.child = undefined;
                this.stdoutBuffer = "";
                this.handshakeCompleted = false;
            });
        }

        try {
            const handshakeResponse = await this.sendRequestInternal<HandshakeRequestSpec>({
                requestType: REQUEST_TYPE_HANDSHAKE,
            });

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

        for (const pendingRequest of this.pending.values()) {
            clearTimeout(pendingRequest.timeout);
            pendingRequest.reject(new Error("Wrapper client disposed."));
        }
        this.pending.clear();

        if (this.child !== undefined) {
            this.child.kill();
            this.child = undefined;
        }
    }

    public async sendRequest<Spec extends AnyWrapperRequestSpec>(
        payload: Spec["request"],
    ): Promise<WrapperDaemonResponse<Spec["requestType"], Spec["response"]>> {
        if (!this.isEnabled()) {
            throw new Error("LSP wrapper is disabled.");
        }

        await this.connect();
        return this.sendRequestInternal<Spec>(payload);
    }

    private async sendRequestInternal<Spec extends AnyWrapperRequestSpec>(
        payload: Spec["request"],
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

        return new Promise<WrapperDaemonResponse<Spec["requestType"], Spec["response"]>>(
            (resolve, reject) => {
                const timeout = setTimeout(() => {
                    this.pending.delete(id);
                    reject(new Error("Wrapper timed out."));
                }, 12_000);

                this.pending.set(id, {
                    expectedResponseType: payload.requestType,
                    resolve: resolve as (response: AnyWrapperResponse) => void,
                    reject,
                    timeout,
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

        clearTimeout(pendingRequest.timeout);
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

        clearTimeout(pendingRequest.timeout);
        this.pending.delete(id);
        pendingRequest.reject(error);
    }

    private rejectAllPending(error: Error): void {
        for (const [id, pendingRequest] of this.pending.entries()) {
            clearTimeout(pendingRequest.timeout);
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

        const { stdout } = await execFileAsync("ps", ["-o", "rss=", "-p", String(pid)]);
        const rssKb = Number.parseInt(stdout.trim(), 10);
        if (!Number.isFinite(rssKb)) {
            throw new Error(
                `Could not parse wrapper memory usage for pid ${pid}: '${stdout.trim()}'`,
            );
        }

        return {
            pid,
            rssBytes: rssKb * 1024,
        };
    }
}

export function setWrapperResolutionOptions(options: WrapperResolutionOptions): void {
    wrapperResolutionOptions = options;
}

let instance: RumbleWrapperClient | null = null;

export function getWrapperClient(): RumbleWrapperClient {
    if (instance === null) {
        instance = new RumbleWrapperClient();
    }
    return instance;
}
