import { describe, expect, it } from "vitest";
import { countChanges, diffLines, diffWords, type DiffPart } from "@/lib/utils/text-diff";

const side = (parts: DiffPart[], keep: "insert" | "delete") =>
  parts.filter((part) => part.type === "equal" || part.type === keep).map((part) => part.value).join("");

describe("diffWords", () => {
  it("marks only the words that changed", () => {
    const parts = diffWords("The quick brown fox", "The slow brown fox");
    expect(parts).toEqual([
      { type: "equal", value: "The " },
      { type: "delete", value: "quick" },
      { type: "insert", value: "slow" },
      { type: "equal", value: " brown fox" },
    ]);
  });

  it("can rebuild both texts exactly", () => {
    const before = "One  two\tthree four";
    const after = "Zero one two three, four five";
    const parts = diffWords(before, after);
    expect(side(parts, "delete")).toBe(before);
    expect(side(parts, "insert")).toBe(after);
  });

  it("returns nothing for two empty texts and one insert for new text", () => {
    expect(diffWords("", "")).toEqual([]);
    expect(diffWords("", "Hello world")).toEqual([{ type: "insert", value: "Hello world" }]);
  });
});

describe("diffLines", () => {
  it("shows an edited line as the whole old line, then the whole new line", () => {
    const rows = diffLines("Intro\n\nOld middle line\n\nEnd", "Intro\n\nNew middle line\n\nEnd");
    expect(rows.map((row) => row.type)).toEqual(["equal", "equal", "delete", "insert", "equal", "equal"]);
    expect(rows[2].parts).toEqual([
      { type: "delete", value: "Old" },
      { type: "equal", value: " middle line" },
    ]);
    expect(rows[3].parts).toEqual([
      { type: "insert", value: "New" },
      { type: "equal", value: " middle line" },
    ]);
  });

  it("lists every removed line before the added ones, like git", () => {
    const rows = diffLines("hello first line,\nsecond line,\nthird line", "hello not first line\nsec line\nthird line");
    expect(rows.map((row) => row.type)).toEqual(["delete", "delete", "insert", "insert", "equal"]);
    expect(rows.map((row) => row.parts.map((part) => part.value).join(""))).toEqual([
      "hello first line,",
      "second line,",
      "hello not first line",
      "sec line",
      "third line",
    ]);
  });

  it("shows added and removed paragraphs whole", () => {
    const rows = diffLines("A\nB\nC", "A\nC\nD");
    expect(rows).toEqual([
      { type: "equal", parts: [{ type: "equal", value: "A" }] },
      { type: "delete", parts: [{ type: "delete", value: "B" }] },
      { type: "equal", parts: [{ type: "equal", value: "C" }] },
      { type: "insert", parts: [{ type: "insert", value: "D" }] },
    ]);
  });

  it("treats a story written from nothing as all new", () => {
    expect(diffLines("", "First\nSecond").every((row) => row.type === "insert")).toBe(true);
  });

  it("still answers for very long rewrites", () => {
    const before = Array.from({ length: 3000 }, (_, i) => `old ${i}`).join("\n");
    const after = Array.from({ length: 3000 }, (_, i) => `new ${i}`).join("\n");
    const rows = diffLines(before, after);
    // Every line was edited, so each shows twice: the old line, then the new one.
    expect(rows).toHaveLength(6000);
    expect(rows[0].type).toBe("delete");
    expect(rows[5999].type).toBe("insert");
  });
});

describe("countChanges", () => {
  it("counts added and removed words", () => {
    expect(countChanges(diffWords("a b c", "a x y c"))).toEqual({ added: 2, removed: 1 });
  });
});
