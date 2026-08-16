export function createFunctionCallSnippet(functionName: string, parameterNames: string[]): string {
    const placeholders = parameterNames.map(
        (parameterName, index) => `\${${index + 1}:${escapeSnippetText(parameterName)}}`,
    );
    return `${functionName}(${placeholders.join(", ")})$0`;
}

function escapeSnippetText(text: string): string {
    return text.replaceAll("\\", "\\\\").replaceAll("$", "\\$").replaceAll("}", "\\}");
}
