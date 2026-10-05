import { describe, expect, it } from "vitest";
import { parseBlocks } from "@/lib/capsule/engine/parse";
import { renderInline, type InlineContext } from "@/lib/capsule/engine/inline";
import { renderNewsletterMarkdown } from "@/lib/utils/markdown";

function context() {
  const warnings: string[] = [];
  const ctx: InlineContext = {
    warn: (code) => warnings.push(code),
    footnoteRef: (id) => `<sup>${id}</sup>`,
    keepImageStyle: false,
  };
  return { ctx, warnings };
}

describe("parseBlocks", () => {
  const kinds = (source: string) => parseBlocks(source).map((block) => block.kind);

  it("reads every kind of block", () => {
    const source = [
      "# H1",
      "text",
      "- a",
      "1. b",
      "> q",
      "```js",
      "x",
      "```",
      "![alt](https://a.co/i.png)",
      "---",
      "| a | b |",
      "|---|---|",
      "| 1 | 2 |",
      "$$ x^2 $$",
      "https://youtu.be/x",
      "[^1]: note",
    ].join("\n");
    expect(kinds(source)).toEqual([
      "heading",
      "paragraph",
      "list",
      "list",
      "quote",
      "code",
      "image",
      "hr",
      "table",
      "math",
      "embed",
      "footnote",
    ]);
  });

  it("keeps heading levels one to six", () => {
    const levels = parseBlocks("# a\n## b\n###### f").map((block) => (block.kind === "heading" ? block.level : 0));
    expect(levels).toEqual([1, 2, 6]);
  });

  it("joins quote lines and keeps list items together, noting indentation", () => {
    const [quote, list] = parseBlocks("> one\n> two\n\n- a\n  - b\n- c");
    expect(quote).toEqual({ kind: "quote", text: "one two" });
    expect(list).toEqual({ kind: "list", ordered: false, items: ["a", "b", "c"], nested: true });
  });

  it("keeps code exactly, and runs an unclosed fence to the end", () => {
    expect(parseBlocks("```py\n  a <b>\n\n c\n```")[0]).toEqual({ kind: "code", language: "py", text: "  a <b>\n\n c" });
    expect(parseBlocks("```\nopen")[0]).toEqual({ kind: "code", language: "", text: "open" });
  });

  it("cleans the code language so it cannot break an attribute", () => {
    expect(parseBlocks('```js" onload="x\n1\n```')[0]).toMatchObject({ language: "jsonloadx" });
  });

  it("reads tables only with a separator row", () => {
    expect(parseBlocks("| a | b |\n|:--|--:|\n| 1 | 2 |")[0]).toEqual({
      kind: "table",
      header: ["a", "b"],
      rows: [["1", "2"]],
    });
    expect(kinds("| just | pipes |")).toEqual(["paragraph"]);
  });

  it("reads a table whose rows are separated by blank lines, as pasted from a chat", () => {
    const pasted = "| Step | Pain |\n\n|---|---|\n\n| One | Hours |\n\n| Two | Slips |\n\nAfter the table.";
    expect(parseBlocks(pasted)).toEqual([
      { kind: "table", header: ["Step", "Pain"], rows: [["One", "Hours"], ["Two", "Slips"]] },
      { kind: "paragraph", text: "After the table." },
    ]);
  });

  it("does not turn a pipe line, a blank line and a lone rule into a table", () => {
    expect(kinds("| just | pipes |\n\n---")).toEqual(["paragraph", "hr"]);
  });

  it("ends a table at the first filled line that does not start with a pipe", () => {
    expect(kinds("| a |\n|---|\n| 1 |\n\nplain\n\n| late |")).toEqual(["table", "paragraph", "paragraph"]);
  });

  it("reads a multi-line math block", () => {
    expect(parseBlocks("$$\na + b\n= c\n$$")[0]).toEqual({ kind: "math", tex: "a + b\n= c" });
  });

  it("treats a link inside a sentence as text, and a bare link on its own line as an embed", () => {
    expect(kinds("see https://a.co now")).toEqual(["paragraph"]);
    expect(kinds("https://a.co/x")).toEqual(["embed"]);
  });
});

describe("renderInline", () => {
  it("escapes html and formats bold, italic, strike and code", () => {
    const { ctx } = context();
    expect(renderInline("<b> **x** _y_ *z* ~~w~~ `<i>`", ctx)).toBe(
      "&lt;b&gt; <strong>x</strong> <em>y</em> <em>z</em> <del>w</del> <code>&lt;i&gt;</code>",
    );
  });

  it("drops links that are not web or mail addresses, with a warning", () => {
    const { ctx, warnings } = context();
    expect(renderInline("[click](javascript:alert)", ctx)).toBe("click");
    expect(renderInline("[rel](/about)", ctx)).toBe("rel");
    expect(warnings).toContain("link-removed");
  });

  it("cannot be broken out of an href with a quote", () => {
    const { ctx } = context();
    const html = renderInline('[x](https://a.co/"onclick="evil)', ctx);
    expect(html).toBe('<a href="https://a.co/&quot;onclick=&quot;evil">x</a>');
  });

  it("does not turn underscores inside an address or a word into italics", () => {
    const { ctx } = context();
    expect(renderInline("[a](https://a.co/x_y_z) snake_case_word", ctx)).toBe('<a href="https://a.co/x_y_z">a</a> snake_case_word');
  });

  it("warns about images that are not at a public https address", () => {
    const { ctx, warnings } = context();
    renderInline("![a](https://a.co/i.png)", ctx);
    expect(warnings).toEqual([]);
    renderInline("![a](http://a.co/i.png) ![b](blob:abc)", ctx);
    expect(warnings).toEqual(["image-not-public", "image-not-public"]);
  });

  it("hands footnote references to the platform", () => {
    const { ctx } = context();
    expect(renderInline("claim[^1]", ctx)).toBe("claim<sup>1</sup>");
  });

  it("survives a stray placeholder character in the text", () => {
    const { ctx } = context();
    expect(renderInline("odd \u0000 text", ctx)).toBe("odd  text");
  });
});

describe("website renderer links", () => {
  it("keeps web links and neutralises javascript: and quote breakers", () => {
    expect(renderNewsletterMarkdown("[a](https://a.co)")).toContain('href="https://a.co"');
    expect(renderNewsletterMarkdown("[a](javascript:alert)")).toBe("<p>a</p>");
    expect(renderNewsletterMarkdown('[a](https://a.co/"onclick="x)')).toContain('href="https://a.co/&quot;onclick=&quot;x"');
  });
});
