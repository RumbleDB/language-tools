export function createFunctionCallSnippet(functionName: string, parameterNames: string[]): string {
    const placeholders = parameterNames.map(
        (parameterName, index) => `\${${index + 1}:${escapeSnippetText(parameterName)}}`,
    );
    return `${escapeSnippetText(functionName)}(${placeholders.join(", ")})$0`;
}

/**
 * The call a function completion inserts, or `null` when it cannot be called there. After `=>`
 * the expression before the arrow fills the first parameter, so the call leaves it out, and a
 * function without parameters cannot be called at all.
 */
export function createCallSnippetFor(
    functionName: string,
    parameterNames: string[],
    arrow: boolean | undefined,
): string | null {
    if (!arrow) {
        return createFunctionCallSnippet(functionName, parameterNames);
    }
    return parameterNames.length === 0
        ? null
        : createFunctionCallSnippet(functionName, parameterNames.slice(1));
}

export function escapeSnippetText(text: string): string {
    return text.replaceAll("\\", "\\\\").replaceAll("$", "\\$").replaceAll("}", "\\}");
}
