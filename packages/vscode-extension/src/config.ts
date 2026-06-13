import type { ClientConfiguration } from "jsoniq-language-server";
import * as vscode from "vscode";

export const config: ClientConfiguration = {
    wrapper: {
        enabled: vscode.workspace.getConfiguration("jsoniq.lsp.wrapper").get("enabled", false),
    },
};
