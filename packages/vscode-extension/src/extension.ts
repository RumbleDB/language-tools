import * as vscode from "vscode";
import {
    LanguageClient,
    type LanguageClientOptions,
    type ServerOptions,
    TransportKind,
} from "vscode-languageclient/node";

import { JSONIQ_LANGUAGE_ID, XQUERY_LANGUAGE_ID } from "./const.js";
import { JUPYTER_NOTEBOOK_SELECTOR } from "./notebook/index.js";
import { initializeCustomNotifications } from "./notifications/index.js";

let client: LanguageClient | undefined;

export async function activate(context: vscode.ExtensionContext): Promise<void> {
    const serverModule = require.resolve("jsoniq-language-server/bundled");
    const globalStoragePath = context.globalStorageUri.fsPath;

    await vscode.workspace.fs.createDirectory(context.globalStorageUri);

    const serverOptions: ServerOptions = {
        run: {
            module: serverModule,
            transport: TransportKind.ipc,
            options: {
                env: {
                    ...process.env,
                    JSONIQ_LSP_CACHE_DIR: globalStoragePath,
                },
            },
        },
        debug: {
            module: serverModule,
            transport: TransportKind.stdio,
            options: {
                execArgv: ["--nolazy", "--inspect=6009"],
                env: {
                    ...process.env,
                    JSONIQ_LSP_DEBUG: "1",
                    JSONIQ_LSP_CACHE_DIR: globalStoragePath,
                },
            },
        },
    };

    const clientOptions: LanguageClientOptions = {
        documentSelector: [
            { scheme: "file", language: JSONIQ_LANGUAGE_ID },
            { scheme: "file", language: XQUERY_LANGUAGE_ID },
            JUPYTER_NOTEBOOK_SELECTOR,
        ],
    };

    client = new LanguageClient(
        "jsoniqLanguageServer",
        "JSONiq Language Server",
        serverOptions,
        clientOptions,
    );

    context.subscriptions.push(client);
    await client.start();
    initializeCustomNotifications(client, context);
}

export async function deactivate(): Promise<void> {
    if (client !== undefined) {
        await client.stop();
        client = undefined;
    }
}
