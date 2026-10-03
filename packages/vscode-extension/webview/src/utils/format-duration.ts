export function formatDuration(durationMs: number): string {
    if (!Number.isFinite(durationMs)) return "—";
    const milliseconds = Math.max(0, Math.round(durationMs));
    if (milliseconds < 1000) return `${milliseconds} ms`;

    const seconds = Math.round(milliseconds / 10) / 100;
    if (seconds < 60) return `${seconds} s`;

    const totalSeconds = Math.round(seconds);
    const hours = Math.floor(totalSeconds / 3600);
    const minutes = Math.floor((totalSeconds % 3600) / 60);
    const remainingSeconds = totalSeconds % 60;
    return [
        hours ? `${hours} h` : "",
        minutes ? `${minutes} min` : "",
        remainingSeconds ? `${remainingSeconds} s` : "",
    ]
        .filter(Boolean)
        .join(" ");
}
