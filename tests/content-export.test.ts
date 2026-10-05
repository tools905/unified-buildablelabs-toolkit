import { describe, expect, it } from "vitest";
import { exportKey, ideaPdfFileName, pageSizeFor } from "@/lib/utils/content-export";
import { contentIdeaAssignedEmailHtml, normalizeEmailFrom } from "@/lib/services/email-service";

describe("the downloaded PDF", () => {
  it("is named after the idea, safe for any computer or phone", () => {
    expect(ideaPdfFileName("If you're founder - Hire or Automate")).toBe("If you re founder - Hire or Automate.pdf");
    expect(ideaPdfFileName("Claude Opus 5.5: the token tax / 2026")).toBe("Claude Opus 5 5 the token tax 2026.pdf");
    expect(ideaPdfFileName("   ")).toBe("post.pdf");
    expect(ideaPdfFileName("x".repeat(200))).toHaveLength(84);
  });

  it("is reused for the same set of files and rebuilt when the files change", () => {
    expect(exportKey([{ id: "a" }, { id: "b" }])).toBe(exportKey([{ id: "a" }, { id: "b" }]));
    expect(exportKey([{ id: "a" }, { id: "b" }])).not.toBe(exportKey([{ id: "b" }, { id: "a" }]));
    expect(exportKey([{ id: "a" }])).not.toBe(exportKey([{ id: "a" }, { id: "c" }]));
  });

  it("sizes a page from its picture, within what PDF readers handle well", () => {
    expect(pageSizeFor(1080, 1350)).toEqual({ width: 1080, height: 1350 });
    expect(pageSizeFor(4000, 2000)).toEqual({ width: 2000, height: 1000 });
  });
});

describe("emails", () => {
  it("are sent as BuildableLabs Team Connect from the configured address", () => {
    expect(normalizeEmailFrom('"BuildableLabs Toolkit <notifications@buildablelabs.com>"')).toBe(
      "BuildableLabs Team Connect <notifications@buildablelabs.com>",
    );
    expect(normalizeEmailFrom("notifications@buildablelabs.com")).toBe("BuildableLabs Team Connect <notifications@buildablelabs.com>");
  });

  it("tell the assignee who assigned the idea, without letting names inject HTML", () => {
    const html = contentIdeaAssignedEmailHtml({
      assigneeName: "Ana",
      assignerName: "Akhil <script>",
      ideaTitle: "Founder Bingo",
      url: "https://example.test/teams/tools/content-board?idea=1",
    });
    expect(html).toContain("An idea to work on has been assigned to you by Akhil &lt;script&gt;");
    expect(html).toContain("Founder Bingo");
    expect(html).toContain("https://example.test/teams/tools/content-board?idea=1");
    expect(html).not.toContain("<script>");
  });
});
