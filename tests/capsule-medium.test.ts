import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { adapters } from "@/lib/capsule/adapters";
import type { Draft } from "@/lib/capsule/types";

// Golden test: the fixture post through the Medium converter must give the same html and warnings
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

const medium = (overrides: Partial<Draft> = {}) => adapters.medium.transform(draft(overrides));

describe("Medium converter: fixture post", () => {
  it("matches the golden html", async () => {
    await expect(medium().html).toMatchFileSnapshot("fixtures/__golden__/medium.html");
  });

  it("raises exactly the expected warnings, once each", () => {
    expect(medium().warnings.map((w) => w.code)).toEqual([
      "heading-flattened",
      "link-removed",
      "list-flattened",
      "image-not-public",
      "code-no-highlight",
      "table-as-list",
      "math-plain",
      "embed-manual",
      "footnotes-converted",
    ]);
  });
});

describe("Medium converter: rules", () => {
  const html = (body: string) => medium({ body, title: "", subtitle: "" }).html;

  it("puts the title and subtitle on top", () => {
    expect(medium({ body: "x" }).html.startsWith("<h1>Write once, post twice</h1><h2>How the capsule works</h2><p>")).toBe(true);
  });

  it("maps headings to Medium's two sizes", () => {
    expect(html("# a\n## b\n### c\n#### d")).toBe("<h3>a</h3>\n<h3>b</h3>\n<h4>c</h4>\n<h4>d</h4>");
  });

  it("sends code without a language class and escaped", () => {
    expect(html("```ts\na < b\n```")).toBe("<pre>a &lt; b</pre>");
  });

  it("turns a table into a list of rows", () => {
    expect(html("| A | B |\n|---|---|\n| 1 | 2 |")).toBe("<ul><li><strong>A</strong>: 1; <strong>B</strong>: 2</li></ul>");
  });

  it("numbers footnotes in the order they are mentioned and lists them at the end", () => {
    expect(html("x[^b] y[^a]\n\n[^a]: A\n[^b]: B")).toBe("<p>x<sup>1</sup> y<sup>2</sup></p>\n<h4>Notes</h4><ol><li>B</li><li>A</li></ol>");
  });

  it("leaves a reference to a missing note as text", () => {
    expect(html("x[^9]")).toBe("<p>x[^9]</p>");
  });

  it("wraps images in a figure without the website's size style", () => {
    expect(html("![a](https://a.co/i.png#nl=small,left)")).toBe('<figure><img alt="a" src="https://a.co/i.png" /></figure>');
  });

  it("has no warnings for a plain, complete post", () => {
    expect(medium({ body: "Just **words**." }).warnings).toEqual([]);
  });
});
