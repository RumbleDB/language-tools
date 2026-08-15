import { buildCommentAttachmentMap } from "server/formatter/comments.js";
import { expect, it } from "vitest";

import { parserService } from "./services.js";
import { testDocument } from "./test-utils.js";

function commentTexts(groups: Iterable<readonly { text?: string | null }[]>): string[] {
    return [...groups].flatMap((comments) => comments.map((comment) => comment.text ?? ""));
}

it("attaches leading, trailing, and dangling comments in source order", () => {
    const source = [
        "(: file header :)",
        "[",
        "1, (: trailing comma :)",
        "(: before second :)",
        "2",
        "] (: trailing array :)",
        "(: end of file :)",
    ].join("\n");
    const parsed = parserService.parse(testDocument("comment-attachments", source));
    expect(parsed.diagnostics).toEqual([]);

    const attachments = buildCommentAttachmentMap(parsed.tokenStream);
    expect(commentTexts(attachments.leading.values())).toEqual([
        "(: file header :)",
        "(: before second :)",
    ]);
    expect(commentTexts(attachments.trailing.values())).toEqual([
        "(: trailing comma :)",
        "(: trailing array :)",
    ]);
    expect(attachments.dangling.map((comment) => comment.text)).toEqual(["(: end of file :)"]);
});
