import type { Doc } from "./doc.js";
import type { FormatterOptions } from "./options.js";

type Mode = "flat" | "break";

interface Command {
    readonly indent: number;
    readonly mode: Mode;
    readonly doc: Doc;
}

/**
 * Renders a `Doc` tree into a formatted string using Wadler/Prettier-style layout algorithm.
 */
export function printDocToString(doc: Doc, options: FormatterOptions): string {
    const width = options.maxLineWidth;
    const indentStr = " ".repeat(options.indentSize);

    let output = "";
    let currentColumn = 0;

    const groupModes = new Map<symbol, Mode>();

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
                    mode === "flat" || fits(current.doc, width - currentColumn, groupModes)
                        ? "flat"
                        : "break";
                if (current.id) {
                    groupModes.set(current.id, groupMode);
                }
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
            case "ifBreak": {
                const targetMode = current.groupId
                    ? (groupModes.get(current.groupId) ?? mode)
                    : mode;
                const chosen = targetMode === "break" ? current.breakDoc : current.flatDoc;
                cmds.push({ indent, mode, doc: chosen });
                break;
            }
        }
    }

    return output;
}

/**
 * Checks if a Doc tree fits within the remaining line width when evaluated flat.
 */
function fits(doc: Doc, remainingWidth: number, groupModes: Map<symbol, Mode>): boolean {
    if (remainingWidth < 0) {
        return false;
    }

    let restWidth = remainingWidth;
    const cmds: Command[] = [{ indent: 0, mode: "flat", doc }];

    while (cmds.length > 0) {
        if (restWidth < 0) {
            return false;
        }

        const cmd = cmds.pop()!;
        const { indent, mode, doc: current } = cmd;

        switch (current.kind) {
            case "text": {
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
                cmds.push({ indent, mode: "flat", doc: current.doc });
                break;
            }
            case "line": {
                if (current.hard) {
                    return false; // Hard line breaks force the group to break
                }
                if (current.soft) {
                    // Prints nothing in flat mode
                } else {
                    restWidth -= 1; // Prints 1 space in flat mode
                }
                break;
            }
            case "ifBreak": {
                const targetMode = current.groupId
                    ? (groupModes.get(current.groupId) ?? mode)
                    : mode;
                const chosen = targetMode === "break" ? current.breakDoc : current.flatDoc;
                cmds.push({ indent, mode, doc: chosen });
                break;
            }
        }
    }

    return true;
}
