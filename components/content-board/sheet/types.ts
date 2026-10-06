// The shared "Creators Profiles Ideas" workbook on the Calendar page.

export const WORKBOOK_TITLE = "Creators Profiles Ideas";

export type SheetTab = {
  id: string;
  workspace_id: string;
  name: string;
  position: number;
  created_by: string | null;
  created_at: string;
  updated_at: string;
};

export type SheetColumn = {
  id: string;
  tab_id: string;
  workspace_id: string;
  name: string;
  position: number;
  width: number;
  created_at: string;
};

export type SheetRow = {
  id: string;
  tab_id: string;
  workspace_id: string;
  position: number;
  // { "<column id>": "text" }
  cells: Record<string, string>;
  created_by: string | null;
  updated_by: string | null;
  created_at: string;
  updated_at: string;
};

export type Workbook = { tabs: SheetTab[]; columns: SheetColumn[]; rows: SheetRow[] };

const byPosition = <T extends { position: number; created_at: string }>(a: T, b: T) =>
  a.position - b.position || a.created_at.localeCompare(b.created_at);

export function sortWorkbook(workbook: Workbook): Workbook {
  return {
    tabs: [...workbook.tabs].sort(byPosition),
    columns: [...workbook.columns].sort(byPosition),
    rows: [...workbook.rows].sort(byPosition),
  };
}

// A position between two neighbours (or after the last / before the first), so a row or column can be
// inserted anywhere without renumbering the others.
export function positionBetween(before: number | null, after: number | null) {
  if (before === null && after === null) return 1;
  if (before === null) return (after as number) - 1;
  if (after === null) return before + 1;
  return (before + after) / 2;
}

// A row matches a filter when any of its cells contains the text, ignoring case.
export function rowMatches(row: SheetRow, filter: string) {
  const query = filter.trim().toLowerCase();
  if (!query) return true;
  return Object.values(row.cells).some((value) => value.toLowerCase().includes(query));
}
