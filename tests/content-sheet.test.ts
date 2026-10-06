import { describe, expect, it } from "vitest";
import { strFromU8, unzipSync } from "fflate";
import { buildXlsx, columnLetter, safeSheetNames } from "@/lib/utils/xlsx-writer";
import { positionBetween, rowMatches, sortWorkbook, type SheetRow } from "@/components/content-board/sheet/types";

describe("the Excel download", () => {
  const file = buildXlsx([
    {
      name: "PAVAN",
      columns: [{ name: "Name", width: 171 }, { name: "Links", width: 256 }, { name: "Platform" }],
      rows: [
        ["Allie K. Miller", "https://www.linkedin.com/in/alliekmiller/", "LinkedIn"],
        ["Tom & Jerry <3", "", "Instagram"],
      ],
    },
    { name: "ANANYA", columns: [{ name: "Name" }], rows: [] },
  ]);
  const files = unzipSync(file);
  const text = (path: string) => strFromU8(files[path]);

  it("is a workbook with one worksheet per tab", () => {
    expect(Object.keys(files)).toEqual(
      expect.arrayContaining(["[Content_Types].xml", "xl/workbook.xml", "xl/styles.xml", "xl/worksheets/sheet1.xml", "xl/worksheets/sheet2.xml"]),
    );
    expect(text("xl/workbook.xml")).toContain('<sheet name="PAVAN" sheetId="1" r:id="rId1"/>');
    expect(text("xl/workbook.xml")).toContain('<sheet name="ANANYA" sheetId="2" r:id="rId2"/>');
  });

  it("keeps the headings bold, the text exact and the links clickable", () => {
    const sheet = text("xl/worksheets/sheet1.xml");
    expect(sheet).toContain('<c r="A1" t="inlineStr" s="1"><is><t xml:space="preserve">Name</t></is></c>');
    expect(sheet).toContain("Tom &amp; Jerry &lt;3");
    expect(sheet).toContain('<hyperlink ref="B2" r:id="rId1"/>');
    expect(text("xl/worksheets/_rels/sheet1.xml.rels")).toContain('Target="https://www.linkedin.com/in/alliekmiller/" TargetMode="External"');
    expect(sheet).toContain('<col min="1" max="1" width="24" customWidth="1"/>');
  });

  it("names tabs the way Excel accepts", () => {
    expect(safeSheetNames(["a/b", "A/B", "", "x".repeat(40)])).toEqual(["a b", "A B (2)", "Sheet3", "x".repeat(31)]);
    expect(columnLetter(0)).toBe("A");
    expect(columnLetter(25)).toBe("Z");
    expect(columnLetter(26)).toBe("AA");
  });
});

describe("the shared sheet", () => {
  const row = (id: string, position: number, cells: Record<string, string> = {}): SheetRow => ({
    id,
    tab_id: "t",
    workspace_id: "w",
    position,
    cells,
    created_by: null,
    updated_by: null,
    created_at: "2026-10-06T00:00:00Z",
    updated_at: "2026-10-06T00:00:00Z",
  });

  it("can insert a row anywhere without renumbering the rest", () => {
    expect(positionBetween(null, null)).toBe(1);
    expect(positionBetween(3, null)).toBe(4);
    expect(positionBetween(null, 1)).toBe(0);
    expect(positionBetween(1, 2)).toBe(1.5);
    const sorted = sortWorkbook({ tabs: [], columns: [], rows: [row("b", 2), row("a", 1), row("between", 1.5)] });
    expect(sorted.rows.map((item) => item.id)).toEqual(["a", "between", "b"]);
  });

  it("filters rows by any cell, ignoring case", () => {
    const allie = row("r", 1, { c1: "Allie K. Miller", c2: "LinkedIn" });
    expect(rowMatches(allie, "linkedin")).toBe(true);
    expect(rowMatches(allie, "  ")).toBe(true);
    expect(rowMatches(allie, "instagram")).toBe(false);
  });
});
