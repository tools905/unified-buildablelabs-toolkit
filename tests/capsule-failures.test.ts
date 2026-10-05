import { describe, expect, it } from "vitest";
import { adapters } from "@/lib/capsule/adapters";
import { CAPSULE_PLATFORMS } from "@/lib/capsule/preview";
import type { Draft } from "@/lib/capsule/types";

// Failure cases from the test plan: things a writer can do that must not break a pasted post.

const draft = (body: string): Draft => ({
  id: "d",
  title: "T",
  subtitle: "S",
  tags: ["t"],
  body,
  canonicalUrl: "https://www.buildablelabs.com/blog/t",
});

describe.each(CAPSULE_PLATFORMS.map(({ value }) => value))("%s converter", (platform) => {
  const run = (body: string) => adapters[platform].transform(draft(body));
  const codes = (body: string) => run(body).warnings.map((w) => w.code);

  it("warns when an image is not at a public https address", () => {
    expect(codes("![x](/local.png)")).toContain("image-not-public");
    expect(codes("![x](data:image/png;base64,AAAA)")).toContain("image-not-public");
    expect(codes("![x](https://abc.supabase.co/storage/v1/object/public/newsletter-images/a.webp)")).not.toContain("image-not-public");
  });

  it("never lets a link, image or code language inject markup", () => {
    const { html } = run(
      [
        "[a](javascript:alert)",
        "[b](https://a.co/\"onclick=\"x)",
        '![c"onerror="x](https://a.co/i.png)',
        '```js" onload="x',
        "1",
        "```",
        "<script>alert(1)</script>",
      ].join("\n"),
    );
    expect(html).not.toMatch(/javascript:/i);
    expect(html).not.toMatch(/\s(onclick|onerror|onload)=/i);
    expect(html).not.toContain("<script>");
  });

  it("converts a very long post quickly", () => {
    const section = [
      "## Heading",
      "A paragraph with **bold**, _italic_, a [link](https://a.co/x_y) and `code`.",
      "- item one",
      "- item two",
      "| a | b |",
      "|---|---|",
      "| 1 | 2 |",
      "Claim[^1].",
      "",
    ].join("\n");
    const body = `${section.repeat(1200)}\n[^1]: Source.`;
    expect(body.length).toBeGreaterThan(100_000);

    const started = performance.now();
    const { html } = run(body);
    expect(performance.now() - started).toBeLessThan(500);
    expect(html.match(/<li>/g)?.length).toBeGreaterThan(3600);
  });

  it("does not hang on pathological input", () => {
    const started = performance.now();
    run(`${"*".repeat(20_000)} ${"_".repeat(20_000)} ${"[".repeat(5_000)}${"(".repeat(5_000)}`);
    expect(performance.now() - started).toBeLessThan(500);
  });
});
