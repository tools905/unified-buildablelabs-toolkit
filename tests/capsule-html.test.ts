import { describe, expect, it } from "vitest";
import { htmlToPlainText } from "@/lib/capsule/html";
import { substackNewPostUrl, editorUrl } from "@/components/capsule/decapsulate";

describe("htmlToPlainText", () => {
  it("keeps paragraphs and list items on their own lines", () => {
    const text = htmlToPlainText("<h2>Title</h2><p>One &amp; two</p><ul><li>a</li><li>b</li></ul>");
    expect(text).toBe("Title\nOne & two\n- a\n- b");
  });

  it("turns line breaks into new lines and drops tags", () => {
    expect(htmlToPlainText("a<br>b<b>c</b>")).toBe("a\nbc");
  });
});

describe("editor addresses", () => {
  it("builds the Substack new-post address from a publication name", () => {
    expect(substackNewPostUrl("buildablelabs")).toBe("https://buildablelabs.substack.com/publish/post?type=newsletter");
  });

  it("accepts a pasted address or a full substack hostname", () => {
    expect(substackNewPostUrl("https://buildablelabs.substack.com/")).toBe(
      "https://buildablelabs.substack.com/publish/post?type=newsletter",
    );
    expect(substackNewPostUrl("  buildablelabs.substack.com ")).toBe(
      "https://buildablelabs.substack.com/publish/post?type=newsletter",
    );
  });

  it("opens Medium's new story page", () => {
    expect(editorUrl("medium", "x")).toBe("https://medium.com/new-story");
  });
});
