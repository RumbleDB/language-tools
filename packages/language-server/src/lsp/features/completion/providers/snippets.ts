import { InsertTextFormat } from "vscode-languageserver";

/** The parts of a completion item that call a function. */
export function functionCallInsertion(functionName: string, parameterNames: string[]) {
    const placeholders = parameterNames.map(
        (parameterName, index) => `\${${index + 1}:${escapeSnippetText(parameterName)}}`,
    );
    return {
        functionName,
        insertText: `${escapeSnippetText(functionName)}(${placeholders.join(", ")})$0`,
        insertTextFormat: InsertTextFormat.Snippet,
    };
}

export function escapeSnippetText(text: string): string {
    return text.replaceAll("\\", "\\\\").replaceAll("$", "\\$").replaceAll("}", "\\}");
}
