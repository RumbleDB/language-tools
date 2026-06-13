import { MEMORY_USAGE_NOTIFICATION } from "jsoniq-language-server/notifications";
import * as vscode from "vscode";
import type { LanguageClient } from "vscode-languageclient/node";

export function registerWrapperMemoryUsageNotification(client: LanguageClient): vscode.Disposable {
    const statusBarItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 10);
    statusBarItem.name = "JSONiq Wrapper Memory Usage";

    const update = MEMORY_USAGE_NOTIFICATION.handle((usage) => {
        const totalMemory =
            usage.wrapper !== null ? usage.languageServer + usage.wrapper : usage.languageServer;
        statusBarItem.text = `$(pulse) Memory usage: ${formatMemoryUsage(totalMemory)}`;
        statusBarItem.tooltip = [
            "JSONiq Language Server: " + formatMemoryUsage(usage.languageServer),
            "Java Wrapper: " + (usage.wrapper !== null ? formatMemoryUsage(usage.wrapper) : "N/A"),
        ].join("\n");
        statusBarItem.show();
    });

    const notificationDisposable = client.onNotification(MEMORY_USAGE_NOTIFICATION.method, update);

    return new vscode.Disposable(() => {
        notificationDisposable.dispose();
        statusBarItem.dispose();
    });
}

function formatMemoryUsage(bytes: number): string {
    return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}
