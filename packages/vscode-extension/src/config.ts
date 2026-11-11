import type { ClientConfiguration, LakehouseFormats } from "jsoniq-language-server";
import * as vscode from "vscode";

/** Reads the settings the language server needs. */
export function readConfiguration(): ClientConfiguration {
    const wrapper = vscode.workspace.getConfiguration("jsoniq.lsp.wrapper");
    return {
        wrapper: {
            enabled: wrapper.get("enabled", false),
            lakehouseFormats: wrapper.get<LakehouseFormats>("lakehouseFormats", {}),
            sparkConf: wrapper.get<Record<string, string | number | boolean>>("sparkConf", {}),
        },
    };
}
