import type { Doc } from "./doc.js";
import type { FormatterOptions } from "./options.js";

type Mode = "flat" | "break";

interface Command {
    readonly indent: number;
    readonly mode: Mode;
    readonly doc: Doc;
}

interface ContinuationBoundary {
    readonly boundary: true;
}

type FitCommand = Command | ContinuationBoundary;

/**
 * Renders a `Doc` tree into a formatted string using Wadler/Prettier-style layout algorithm.
 */
export function printDocToString(doc: Doc, options: FormatterOptions): string {
    const width = options.maxLineWidth;
    const indentStr = options.useTabs ? "\t" : " ".repeat(options.indentSize);

    let output = "";
    let currentColumn = 0;

    const cmds: Command[] = [{ indent: 0, mode: "break", doc }];

    while (cmds.length > 0) {
        const cmd = cmds.pop()!;
        const { indent, mode, doc: current } = cmd;

        switch (current.kind) {
            case "text": {
                output += current.text;
                currentColumn += current.text.length;
                break;
            }
            case "verbatim": {
                output += current.text;
                const lastNewline = Math.max(
                    current.text.lastIndexOf("\n"),
                    current.text.lastIndexOf("\r"),
                );
                currentColumn =
                    lastNewline === -1
                        ? currentColumn + current.text.length
                        : current.text.length - lastNewline - 1;
                break;
            }
            case "concat": {
                for (let i = current.docs.length - 1; i >= 0; i--) {
                    cmds.push({ indent, mode, doc: current.docs[i]! });
                }
                break;
            }
            case "indent": {
                cmds.push({ indent: indent + 1, mode, doc: current.doc });
                break;
            }
            case "group": {
                const groupMode =
                    mode === "flat" ||
                    fits(width - currentColumn, { indent, mode: "flat", doc: current.doc }, cmds)
                        ? "flat"
                        : "break";
                cmds.push({ indent, mode: groupMode, doc: current.doc });
                break;
            }
            case "line": {
                if (mode === "flat") {
                    if (current.hard) {
                        output += "\n" + indentStr.repeat(indent);
                        currentColumn = indent * options.indentSize;
                    } else if (current.soft) {
                        // Soft lines print nothing in flat mode
                    } else {
                        // Standard lines print space in flat mode
                        output += " ";
                        currentColumn += 1;
                    }
                } else {
                    output += "\n" + indentStr.repeat(indent);
                    currentColumn = indent * options.indentSize;
                }
                break;
            }
        }
    }

    return output;
}

/**
 * Checks whether the current line of a pending command stack fits in the remaining width.
 *
 * The stack includes the continuation after a group. This is essential: a group may fit by
 * itself while flattening it leaves insufficient room for the document that follows it.
 */
function fits(
    remainingWidth: number,
    groupCommand: Command,
    continuation: readonly Command[],
): boolean {
    if (remainingWidth < 0) {
        return false;
    }

    let restWidth = remainingWidth;
    const boundary: ContinuationBoundary = { boundary: true };
    const cmds: FitCommand[] = [...continuation, boundary, groupCommand];
    let isContinuation = false;

    while (cmds.length > 0) {
        if (restWidth < 0) {
            return false;
        }

        const cmd = cmds.pop()!;
        if ("boundary" in cmd) {
            isContinuation = true;
            continue;
        }
        const { indent, mode, doc: current } = cmd;

        switch (current.kind) {
            case "text": {
                restWidth -= current.text.length;
                break;
            }
            case "verbatim": {
                const newlineIndex = firstNewlineIndex(current.text);
                if (newlineIndex !== -1) {
                    restWidth -= newlineIndex;
                    return restWidth >= 0 && (isContinuation || mode === "break");
                }
                restWidth -= current.text.length;
                break;
            }
            case "concat": {
                for (let i = current.docs.length - 1; i >= 0; i--) {
                    cmds.push({ indent, mode, doc: current.docs[i]! });
                }
                break;
            }
            case "indent": {
                cmds.push({ indent: indent + 1, mode, doc: current.doc });
                break;
            }
            case "group": {
                cmds.push({ indent, mode: isContinuation ? mode : "flat", doc: current.doc });
                break;
            }
            case "line": {
                if (mode === "break") {
                    return true;
                }
                if (current.hard) {
                    return isContinuation;
                }
                if (current.soft) {
                    // Prints nothing in flat mode
                } else {
                    restWidth -= 1; // Prints 1 space in flat mode
                }
                break;
            }
        }
    }

    return restWidth >= 0;
}

function firstNewlineIndex(value: string): number {
    const lineFeed = value.indexOf("\n");
    const carriageReturn = value.indexOf("\r");
    if (lineFeed === -1) {
        return carriageReturn;
    }
    if (carriageReturn === -1) {
        return lineFeed;
    }
    return Math.min(lineFeed, carriageReturn);
}
