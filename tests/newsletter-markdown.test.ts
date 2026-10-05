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

  it("renders a markdown table", () => {
    const html = renderNewsletterMarkdown("| Step | Pain |\n|---|---|\n| The pain | Hours **lost** |\n| The recipe | Exact steps |");
    expect(html).toBe(
      "<table><thead><tr><th>Step</th><th>Pain</th></tr></thead>" +
        "<tbody><tr><td>The pain</td><td>Hours <strong>lost</strong></td></tr>" +
        "<tr><td>The recipe</td><td>Exact steps</td></tr></tbody></table>",
    );
  });

  it("renders a table pasted with blank lines between the rows, and keeps the text around it", () => {
    const html = renderNewsletterMarkdown(
      "Intro line\n\n| Step | Invoice matching (finance) | Lead research (sales) |\n\n|---|--------------|-----------|\n\n| The pain | Hours a week | Reps spend mornings |\n\n| The recipe | Mostly exact steps | Mostly judgment |\n\nInvoice matching: mostly a for-loop",
    );
    expect(html.startsWith("<p>Intro line</p>\n<table>")).toBe(true);
    expect(html).toContain("<th>Invoice matching (finance)</th>");
    expect(html).toContain("<tr><td>The recipe</td><td>Mostly exact steps</td><td>Mostly judgment</td></tr>");
    expect(html.endsWith("</table>\n<p>Invoice matching: mostly a for-loop</p>")).toBe(true);
    expect(html).not.toContain("|");
  });

  it("supports alignment, missing outer pipes, short rows and escaped pipes", () => {
    const html = renderNewsletterMarkdown("a | b | c\n:--|:-:|--:\n1 | 2\nx \\| y | `code` | 3");
    expect(html).toContain('<th style="text-align:left">a</th><th style="text-align:center">b</th><th style="text-align:right">c</th>');
    expect(html).toContain('<td style="text-align:left">1</td><td style="text-align:center">2</td><td style="text-align:right"></td>');
    expect(html).toContain('<td style="text-align:left">x | y</td><td style="text-align:center"><code>code</code></td>');
  });

  it("does not turn a lone pipe line, a divider rule or a mismatched header into a table", () => {
    expect(renderNewsletterMarkdown("a | b")).toBe("<p>a | b</p>");
    expect(renderNewsletterMarkdown("a | b\n---")).toBe("<p>a | b</p>\n<p>---</p>");
    expect(renderNewsletterMarkdown("| a | b |\n|---|")).toBe("<p>| a | b |</p>\n<p>|---|</p>");
  });

  it("ends the table at the first line without a pipe and stops a list before it", () => {
    const html = renderNewsletterMarkdown("- item\n| a | b |\n|---|---|\n| 1 | 2 |\nsecond | row\n\nplain\n\n| late |");
    expect(html).toBe(
      "<ul>\n<li>item</li>\n</ul>\n<table><thead><tr><th>a</th><th>b</th></tr></thead><tbody><tr><td>1</td><td>2</td></tr><tr><td>second</td><td>row</td></tr></tbody></table>\n<p>plain</p>\n<p>| late |</p>",
    );
  });

  it("escapes HTML inside table cells and leaves tables inside code blocks alone", () => {
    expect(renderNewsletterMarkdown("| a |\n|---|\n| <b>x</b> |")).toContain("<td>&lt;b&gt;x&lt;/b&gt;</td>");
    expect(renderNewsletterMarkdown("```\n| a |\n|---|\n```")).toBe("<pre><code>| a |\n|---|</code></pre>");
  });

  it("uses the language name safely", () => {
    const html = renderNewsletterMarkdown('```"><img onerror=x\nx\n```');
    expect(html).not.toContain("<img");
    expect(html).toMatch(/^<pre><code class="language-[A-Za-z0-9_+#-]*">x<\/code><\/pre>$/);
  });
});
