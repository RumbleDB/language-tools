import { createSignal, onCleanup } from "solid-js";

/**
 * Copies the given text to the clipboard using the modern Web Clipboard API,
 * which is natively available in VS Code webview contexts.
 */
export async function copyToClipboard(text: string): Promise<boolean> {
    try {
        await navigator.clipboard.writeText(text);
        return true;
    } catch (err) {
        console.error("Failed to copy to clipboard:", err);
        return false;
    }
}

/**
 * A SolidJS reactive hook providing a copy action and transient `copied` state.
 */
export function createCopyAction(durationMs = 2000) {
    const [copied, setCopied] = createSignal(false);
    let timer: ReturnType<typeof setTimeout> | undefined;

    onCleanup(() => {
        if (timer) clearTimeout(timer);
    });

    const copy = async (text: string) => {
        const success = await copyToClipboard(text);
        if (success) {
            setCopied(true);
            if (timer) clearTimeout(timer);
            timer = setTimeout(() => setCopied(false), durationMs);
        }
        return success;
    };

    return { copied, copy } as const;
}
