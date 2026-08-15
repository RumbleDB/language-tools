import { createHash } from "node:crypto";
import fs from "node:fs";

const DOWNLOAD_PROGRESS_BAR_WIDTH = 24;

export interface DownloadProgress {
    stage:
        | "download-started"
        | "download-progress"
        | "download-complete"
        | "verified"
        | "download-failed";
    downloadedBytes: number;
    totalBytes: number;
    message?: string;
}

export type DownloadProgressReporter = (progress: DownloadProgress) => void;

export function createTerminalProgressReporter(): DownloadProgressReporter | undefined {
    if (!process.stderr.isTTY) {
        return undefined;
    }

    let lastRenderedLine = "";

    return (progress: DownloadProgress) => {
        if (progress.stage === "verified") {
            return;
        }

        if (progress.stage === "download-failed") {
            if (lastRenderedLine.length > 0) {
                process.stderr.write("\n");
            }
            return;
        }

        const boundedDownloadedBytes = Math.min(progress.downloadedBytes, progress.totalBytes);
        const fraction =
            progress.totalBytes <= 0 ? 0 : boundedDownloadedBytes / progress.totalBytes;
        const completedBars = Math.round(fraction * DOWNLOAD_PROGRESS_BAR_WIDTH);
        const bar = `${"=".repeat(completedBars)}${" ".repeat(DOWNLOAD_PROGRESS_BAR_WIDTH - completedBars)}`;
        const percentage = (fraction * 100).toFixed(1).padStart(5, " ");

        const downloadedMB = (boundedDownloadedBytes / 1024 / 1024).toFixed(2);
        const totalMB = (progress.totalBytes / 1024 / 1024).toFixed(2);

        const line = `Downloading wrapper jar [${bar}] ${percentage}% [${downloadedMB}MB/${totalMB}MB]`;

        if (line !== lastRenderedLine) {
            process.stderr.write(`\r${line}`);
            lastRenderedLine = line;
        }

        if (
            progress.stage === "download-complete" ||
            boundedDownloadedBytes >= progress.totalBytes
        ) {
            process.stderr.write("\n");
        }
    };
}

interface DownloadMetadata {
    sha256: string;
    sizeBytes: number;
}

export async function downloadWithProgress(
    url: string,
    destinationPath: string,
    totalBytes: number,
    reportProgress: DownloadProgressReporter | undefined,
): Promise<DownloadMetadata> {
    const response = await fetch(url);
    if (!response.ok) {
        throw new Error(
            `Failed to download wrapper jar: HTTP ${response.status} ${response.statusText}`,
        );
    }

    if (response.body === null) {
        throw new Error("Failed to download wrapper jar: response body is empty.");
    }

    const totalBytesHeader = response.headers.get("content-length");
    const headerSizeBytes =
        totalBytesHeader === null ? undefined : Number.parseInt(totalBytesHeader, 10);
    if (
        headerSizeBytes !== undefined &&
        Number.isFinite(headerSizeBytes) &&
        headerSizeBytes !== totalBytes
    ) {
        throw new Error(
            `Wrapper jar size mismatch before download: expected ${totalBytes} bytes, got ${headerSizeBytes} bytes from HTTP headers.`,
        );
    }

    const hash = createHash("sha256");
    const fileStream = fs.createWriteStream(destinationPath);
    const reader = response.body.getReader();

    let downloadedBytes = 0;

    reportProgress?.({
        stage: "download-started",
        downloadedBytes: 0,
        totalBytes,
    });

    try {
        while (true) {
            const { done, value } = await reader.read();
            if (done) {
                break;
            }

            const chunk = Buffer.from(value);
            hash.update(chunk);

            await new Promise<void>((resolve, reject) => {
                fileStream.write(chunk, (error) => {
                    if (error !== undefined && error !== null) {
                        reject(error);
                        return;
                    }
                    resolve();
                });
            });

            downloadedBytes += chunk.length;

            reportProgress?.({
                stage: "download-progress",
                downloadedBytes,
                totalBytes,
            });
        }

        await new Promise<void>((resolve, reject) => {
            fileStream.end((error: Error | null | undefined) => {
                if (error !== undefined && error !== null) {
                    reject(error);
                    return;
                }
                resolve();
            });
        });
    } catch (error) {
        fileStream.destroy();
        throw error;
    }

    reportProgress?.({
        stage: "download-complete",
        downloadedBytes: downloadedBytes,
        totalBytes,
    });

    return {
        sha256: hash.digest("hex"),
        sizeBytes: downloadedBytes,
    };
}
