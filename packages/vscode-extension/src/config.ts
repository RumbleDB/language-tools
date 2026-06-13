import * as vscode from "vscode";

export const config = {
    wrapper: {
        enabled: vscode.workspace.getConfiguration("jsoniq.lsp.wrapper").get("enabled", false),
    },
};
