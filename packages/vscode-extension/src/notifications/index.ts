import type * as vscode from "vscode";
import type { LanguageClient } from "vscode-languageclient/node";

import { registerActiveParserNotification } from "./active-parser.js";
import { registerWrapperDownloadProgressNotification } from "./download-progress.js";
import { registerWrapperMemoryUsageNotification } from "./memory-usage.js";

export function initializeCustomNotifications(
    client: LanguageClient,
    context: vscode.ExtensionContext,
): void {
    context.subscriptions.push(registerWrapperDownloadProgressNotification(client));
    context.subscriptions.push(registerWrapperMemoryUsageNotification(client));
    context.subscriptions.push(registerActiveParserNotification(client));
}
