import {
    type DownloadProgress,
    WRAPPER_DOWNLOAD_PROGRESS_NOTIFICATION,
} from "jsoniq-language-server/notifications";
import * as vscode from "vscode";
import type { LanguageClient } from "vscode-languageclient/node";

interface ActiveProgress {
    report: (value: { increment?: number; message?: string }) => void;
    resolve: () => void;
    lastPercentage: number;
}

export function registerWrapperDownloadProgressNotification(
    client: LanguageClient,
): vscode.Disposable {
    let active: ActiveProgress | undefined;

    const finish = (): void => {
        active?.resolve();
        active = undefined;
    };

    const start = (): void => {
        if (active !== undefined) {
            return;
        }

        const progressState: ActiveProgress = {
            report: () => {},
            resolve: () => {},
            lastPercentage: 0,
        };

        active = progressState;

        void vscode.window.withProgress(
            {
                location: vscode.ProgressLocation.Notification,
                title: "Downloading RumbleDB wrapper",
                cancellable: false,
            },
            async (progress) => {
                progressState.report = (value) => progress.report(value);
                return await new Promise<void>((resolve) => {
                    progressState.resolve = resolve;
                });
            },
        );
    };

    const update = WRAPPER_DOWNLOAD_PROGRESS_NOTIFICATION.handle((progress) => {
        if (progress.stage === "verified" || progress.stage === "download-failed") {
            finish();
            return;
        }

        if (progress.stage === "download-started") {
            start();
        }

        if (active === undefined) {
            return;
        }

        const percentage =
            progress.totalBytes > 0
                ? Math.min(100, (progress.downloadedBytes / progress.totalBytes) * 100)
                : 0;
        const increment = Math.max(0, percentage - active.lastPercentage);
        active.lastPercentage = percentage;
        active.report({
            increment,
            message: formatProgressMessage(progress),
        });
    });

    const notificationDisposable = client.onNotification(
        WRAPPER_DOWNLOAD_PROGRESS_NOTIFICATION.method,
        update,
    );

    return new vscode.Disposable(() => {
        notificationDisposable.dispose();
        finish();
    });
}

function formatProgressMessage(progress: DownloadProgress): string {
    const downloadedMb = (progress.downloadedBytes / 1024 / 1024).toFixed(1);
    const totalMb = (progress.totalBytes / 1024 / 1024).toFixed(1);
    return `${downloadedMb} MB / ${totalMb} MB`;
}
