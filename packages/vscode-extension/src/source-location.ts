import * as vscode from "vscode";

export function sourceLocationUri(location: string): vscode.Uri {
    if (/^[a-zA-Z]:[\\/]/.test(location) || location.startsWith("/")) {
        return vscode.Uri.file(location);
    }
    const uri = vscode.Uri.parse(location);
    return uri.scheme ? uri : vscode.Uri.file(location);
}

export async function errorSourceText(
    location: string | null,
    queryUri: vscode.Uri,
    queryText: string,
): Promise<string | undefined> {
    if (!location) return undefined;
    try {
        const uri = sourceLocationUri(location);
        if (uri.toString() === queryUri.toString()) return queryText;
        const document = await vscode.workspace.openTextDocument(uri);
        return document.getText();
    } catch {
        // An unavailable source file should not hide the original query error.
        return undefined;
    }
}
