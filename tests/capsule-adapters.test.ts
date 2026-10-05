import { describe, expect, it } from "vitest";
import { adapters } from "@/lib/capsule/adapters";
import { previewAtom } from "@/lib/capsule/preview";
import type { Draft } from "@/lib/capsule/types";

const draft = (overrides: Partial<Draft> = {}): Draft => ({
  id: "d1",
  title: "My <b>title</b>",
  subtitle: "A subtitle",
  tags: ["ai"],
  body: "Hello **world**",
  canonicalUrl: "https://example.com/p",
  ...overrides,
});

const codes = (platform: "medium" | "substack", d: Draft) => adapters[platform].transform(d).warnings.map((w) => w.code);

describe("placeholder adapters", () => {
  it("puts the title and subtitle inside the Medium html, escaped", () => {
    const { html } = adapters.medium.transform(draft());
    expect(html.startsWith("<h1>My &lt;b&gt;title&lt;/b&gt;</h1><h2>A subtitle</h2>")).toBe(true);
    expect(html).toContain("<strong>world</strong>");
  });

  it("keeps the Substack html to the story and the original-link line, without the title", () => {
    const { html } = adapters.substack.transform(draft());
    expect(html).toBe(
      '<p>Hello <strong>world</strong></p>\n<p><em>Originally published at <a href="https://example.com/p">https://example.com/p</a>.</em></p>',
    );
  });

  it("has no warnings for a complete post", () => {
    expect(codes("medium", draft())).toEqual([]);
    expect(codes("substack", draft())).toEqual([]);
  });

  it("warns about what is missing", () => {
    const found = codes("substack", draft({ title: "", body: "", canonicalUrl: "", tags: [] }));
    expect(found).toEqual(expect.arrayContaining(["title-missing", "body-empty", "no-canonical-url", "no-tags"]));
  });

  it("warns that Medium has no code highlighting, only when a language is given", () => {
    expect(codes("medium", draft({ body: "```ts\nx\n```" }))).toContain("code-no-highlight");
    expect(codes("substack", draft({ body: "```ts\nx\n```" }))).not.toContain("code-no-highlight");
    expect(codes("medium", draft({ body: "```\nx\n```" }))).not.toContain("code-no-highlight");
  });
});

describe("previewAtom", () => {
  it("carries the draft's title, subtitle and tags next to the adapter output", () => {
    const atom = previewAtom("substack", draft());
    expect(atom).toMatchObject({ platform: "substack", title: "My <b>title</b>", subtitle: "A subtitle", tags: ["ai"] });
    expect(atom.html).toContain("world");
  });
});
