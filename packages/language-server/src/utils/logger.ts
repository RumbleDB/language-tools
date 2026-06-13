import type { Connection } from "vscode-languageserver";

type LogLevel = "debug" | "info" | "warn" | "error";

const DEBUG_LOG_ENV = "JSONIQ_LSP_DEBUG_LOG";
const DEBUG_ENV = "JSONIQ_LSP_DEBUG";

type LoggerSink = Connection["console"];

let loggerSink: LoggerSink | undefined;

export function setLoggerSink(sink: LoggerSink): void {
    loggerSink = sink;
}

function isDebugEnabled(): boolean {
    return process.env[DEBUG_LOG_ENV] === "1" || process.env[DEBUG_ENV] === "1";
}

function stringifyArg(arg: unknown): string {
    if (typeof arg === "string") {
        return arg;
    }

    if (arg instanceof Error) {
        return arg.stack ?? arg.message;
    }

    try {
        return JSON.stringify(arg, null, 2);
    } catch {
        return String(arg);
    }
}

function writeLog(level: LogLevel, scope: string, args: unknown[]): void {
    if (level === "debug" && !isDebugEnabled()) {
        return;
    }

    const prefix = `[jsoniq-lsp:${scope}]`;
    const payload = [prefix, ...args.map((arg) => stringifyArg(arg))].join(" ");
    if (loggerSink !== undefined) {
        switch (level) {
            case "debug":
                loggerSink.debug(payload);
                break;
            case "info":
                loggerSink.info(payload);
                break;
            case "warn":
                loggerSink.warn(payload);
                break;
            case "error":
                loggerSink.error(payload);
                break;
        }
        return;
    }

    process.stderr.write(`${payload}\n`);
}

export interface Logger {
    debug: (...args: unknown[]) => void;
    info: (...args: unknown[]) => void;
    warn: (...args: unknown[]) => void;
    error: (...args: unknown[]) => void;
}

export function createLogger(scope: string): Logger {
    return {
        debug: (...args: unknown[]) => writeLog("debug", scope, args),
        info: (...args: unknown[]) => writeLog("info", scope, args),
        warn: (...args: unknown[]) => writeLog("warn", scope, args),
        error: (...args: unknown[]) => writeLog("error", scope, args),
    };
}
