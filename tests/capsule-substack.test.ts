import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { adapters } from "@/lib/capsule/adapters";
import type { Draft } from "@/lib/capsule/types";

// Golden test: the fixture post through the Substack converter must give the same html and warnings
// every time. If a rule changes on purpose, update the golden file with `pnpm test -u` and review the diff.

const fixture = readFileSync(path.join(__dirname, "fixtures/capsule-fixture.md"), "utf8");

const draft = (overrides: Partial<Draft> = {}): Draft => ({
  id: "fixture",
  title: "Write once, post twice",
  subtitle: "How the capsule works",
  tags: ["writing"],
  body: fixture,
  canonicalUrl: "https://www.buildablelabs.com/blog/write-once",
  ...overrides,
});

const substack = (overrides: Partial<Draft> = {}) => adapters.substack.transform(draft(overrides));

describe("Substack converter: fixture post", () => {
  it("matches the golden html", async () => {
    await expect(substack().html).toMatchFileSnapshot("fixtures/__golden__/substack.html");
  });

  it("raises exactly the expected warnings, once each", () => {
    expect(substack().warnings.map((w) => w.code)).toEqual([
      "link-removed",
      "list-flattened",
      "image-not-public",
      "table-as-list",
      "math-list",
      "footnotes-converted",
    ]);
  });

  it("gives the same result when run twice (nothing is remembered between posts)", () => {
    expect(substack().html).toBe(substack().html);
  });
});

describe("Substack converter: rules", () => {
  const html = (body: string, overrides: Partial<Draft> = {}) => substack({ body, canonicalUrl: "", ...overrides }).html;

  it("leaves the title and subtitle out of the html, for the side panel to copy", () => {
    expect(html("x")).toBe("<p>x</p>");
  });

  it("never sends an h1, because the post title is Substack's only one", () => {
    expect(html("# a\n## b\n### c")).toBe("<h2>a</h2>\n<h2>b</h2>\n<h3>c</h3>");
  });

  it("keeps the code language and escapes the code", () => {
    expect(html("```ts\na < b\n```")).toBe('<pre><code class="language-ts">a &lt; b</code></pre>');
    expect(html("```\nplain\n```")).toBe("<pre><code>plain</code></pre>");
  });

  it("turns a table into a list of rows", () => {
    expect(html("| A | B |\n|---|---|\n| 1 | 2 |")).toBe("<ul><li><strong>A</strong>: 1; <strong>B</strong>: 2</li></ul>");
  });

  it("numbers footnotes in the order they are mentioned and lists them at the end", () => {
    expect(html("x[^b] y[^a]\n\n[^a]: A\n[^b]: B")).toBe("<p>x<sup>1</sup> y<sup>2</sup></p>\n<h4>Notes</h4><ol><li>B</li><li>A</li></ol>");
  });

  it("warns when a list had indented items, and not otherwise", () => {
    const codes = (body: string) => substack({ body }).warnings.map((w) => w.code);
    expect(codes("- a\n  - b")).toContain("list-flattened");
    expect(codes("- a\n- b")).not.toContain("list-flattened");
  });
});

describe("Substack converter: the original-link line", () => {
  const url = "https://www.buildablelabs.com/blog/write-once";

  it("ends the story with an Originally published at line that links to the original", () => {
    expect(substack({ body: "Body." }).html).toBe(
      `<p>Body.</p>\n<p><em>Originally published at <a href="${url}">${url}</a>.</em></p>`,
    );
  });

  it("escapes the address, so a quote cannot break out of the link", () => {
    const html = substack({ body: "x", canonicalUrl: 'https://a.co/?q="onmouseover="alert(1)' }).html;
    expect(html).toContain('href="https://a.co/?q=&quot;onmouseover=&quot;alert(1)"');
    // Only the href can be broken out of; a quote in the visible link text is harmless.
    expect(html).not.toContain('href="https://a.co/?q="');
  });

  it("leaves the line out, with the usual warning, when there is no original link", () => {
    const result = substack({ body: "Body.", canonicalUrl: "" });
    expect(result.html).toBe("<p>Body.</p>");
    expect(result.warnings.map((w) => w.code)).toEqual(["no-canonical-url"]);
  });

  it("leaves the line out and says why when the address is not a web address", () => {
    const result = substack({ body: "Body.", canonicalUrl: "javascript:alert(1)" });
    expect(result.html).toBe("<p>Body.</p>");
    expect(result.warnings.map((w) => w.code)).toEqual(["canonical-url-invalid"]);
  });
});

describe("Substack converter: equations", () => {
  const tail = (extra: Partial<Draft> = {}) => substack({ body: "Before.\n\n$$\nE = mc^2\n$$\n\nBetween.\n\n$$ a < b $$\n\nAfter.", ...extra });

  it("marks each equation in place and lists them in order at the end, after the original link", () => {
    const { html } = tail();
    expect(html).toContain("<p>Before.</p>\n<p>[Equation 1]</p>\n<p>Between.</p>\n<p>[Equation 2]</p>\n<p>After.</p>");
    expect(html.endsWith(
      '</a>.</em></p><h4>Equations to add</h4><p><strong>Equation 1</strong></p><pre>E = mc^2</pre><p><strong>Equation 2</strong></p><pre>a &lt; b</pre>',
    )).toBe(true);
  });

  it("explains what to do, once, however many equations there are", () => {
    const found = tail().warnings.filter((w) => w.code === "math-list");
    expect(found).toHaveLength(1);
    expect(found[0].message).toMatch(/LaTeX block/);
  });

  it("starts the numbering again for every post", () => {
    tail();
    expect(substack({ body: "$$ x $$", canonicalUrl: "" }).html.startsWith("<p>[Equation 1]</p>")).toBe(true);
  });

  it("adds no list when there are no equations", () => {
    expect(substack({ body: "Plain." }).html).not.toContain("Equations to add");
  });
});
