import { describe, expect, it } from "vitest";
import { renderNewsletterMarkdown } from "@/lib/utils/markdown";

describe("renderNewsletterMarkdown", () => {
  it("keeps the existing basics", () => {
    expect(renderNewsletterMarkdown("Hello **bold** and _soft_")).toBe("<p>Hello <strong>bold</strong> and <em>soft</em></p>");
    expect(renderNewsletterMarkdown("- a\n- b")).toBe("<ul>\n<li>a</li>\n<li>b</li>\n</ul>");
    expect(renderNewsletterMarkdown("> quoted")).toBe("<blockquote>quoted</blockquote>");
  });

  it("renders ## and ### as section headings", () => {
    expect(renderNewsletterMarkdown("## Big\n### Smaller")).toBe("<h2>Big</h2>\n<h3>Smaller</h3>");
  });

  it("does not turn a single # or a hash without a space into a heading", () => {
    expect(renderNewsletterMarkdown("# Title")).toBe("<p># Title</p>");
    expect(renderNewsletterMarkdown("##nospace")).toBe("<p>##nospace</p>");
  });

  it("ends a list before a heading", () => {
    expect(renderNewsletterMarkdown("- a\n## Next")).toBe("<ul>\n<li>a</li>\n</ul>\n<h2>Next</h2>");
  });

  it("renders fenced code exactly as written, with the language", () => {
    const html = renderNewsletterMarkdown("```ts\nconst a = 1;\n  const b = **2**;\n```");
    expect(html).toBe('<pre><code class="language-ts">const a = 1;\n  const b = **2**;</code></pre>');
  });

  it("escapes HTML inside code and elsewhere", () => {
    expect(renderNewsletterMarkdown("```\n<script>x</script>\n```")).toBe("<pre><code>&lt;script&gt;x&lt;/script&gt;</code></pre>");
    expect(renderNewsletterMarkdown("a <b>")).toBe("<p>a &lt;b&gt;</p>");
  });

  it("keeps blank lines inside a code block and still shows an unclosed one", () => {
    expect(renderNewsletterMarkdown("```\na\n\nb\n```")).toBe("<pre><code>a\n\nb</code></pre>");
    expect(renderNewsletterMarkdown("```\nunfinished")).toBe("<pre><code>unfinished</code></pre>");
  });

  it("renders inline code without formatting what is inside it", () => {
    expect(renderNewsletterMarkdown("Use `a_b_c` and **go**")).toBe("<p>Use <code>a_b_c</code> and <strong>go</strong></p>");
  });

  it("uses the language name safely", () => {
    const html = renderNewsletterMarkdown('```"><img onerror=x\nx\n```');
    expect(html).not.toContain("<img");
    expect(html).toMatch(/^<pre><code class="language-[A-Za-z0-9_+#-]*">x<\/code><\/pre>$/);
  });
});
