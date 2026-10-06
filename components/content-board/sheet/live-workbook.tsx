"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { formatDistanceToNowStrict } from "date-fns";
import {
  ArrowDownToLine,
  ArrowUpToLine,
  ChevronDown,
  Download,
  ExternalLink,
  MoreVertical,
  Pencil,
  Plus,
  Search,
  Trash2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { createClient } from "@/lib/supabase/client";
import { cn } from "@/lib/utils/cn";
import {
  positionBetween,
  rowMatches,
  sortWorkbook,
  WORKBOOK_TITLE,
  type SheetColumn,
  type SheetRow,
  type SheetTab,
  type Workbook,
} from "@/components/content-board/sheet/types";

type Table = "content_sheet_tabs" | "content_sheet_columns" | "content_sheet_rows";
type Editing = { kind: "cell"; rowId: string; columnId: string } | { kind: "header"; columnId: string } | null;
type Undo = { label: string; run: () => void } | null;

const TABLE_KEY: Record<Table, keyof Workbook> = {
  content_sheet_tabs: "tabs",
  content_sheet_columns: "columns",
  content_sheet_rows: "rows",
};

const isWebAddress = (value: string) => /^https?:\/\/\S+$/i.test(value.trim());

// The shared spreadsheet. Every edit is saved straight away and sent live to everyone else who has it
// open, so the team works on one copy instead of passing an Excel file around.
export function LiveWorkbook({
  initial,
  workspaceId,
  currentUserId,
  people,
  exportUrl,
}: {
  initial: Workbook;
  workspaceId: string;
  currentUserId: string;
  // id → name, for "Last change by …".
  people: Record<string, string>;
  exportUrl: string;
}) {
  const supabase = useMemo(() => createClient(), []);
  const [workbook, setWorkbook] = useState<Workbook>(() => sortWorkbook(initial));
  const [chosenTabId, setChosenTabId] = useState<string | null>(null);
  const [filter, setFilter] = useState("");
  const [live, setLive] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState<Editing>(null);
  const [renamingTabId, setRenamingTabId] = useState<string | null>(null);
  const [confirmDeleteTab, setConfirmDeleteTab] = useState<string | null>(null);
  const [undo, setUndo] = useState<Undo>(null);
  const undoTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const tabs = workbook.tabs;
  const activeTab = tabs.find((tab) => tab.id === chosenTabId) ?? tabs[0] ?? null;
  const columns = workbook.columns.filter((column) => column.tab_id === activeTab?.id);
  const allRows = workbook.rows.filter((row) => row.tab_id === activeTab?.id);
  const rows = allRows.filter((row) => rowMatches(row, filter));

  // ---- keeping the screen in step with the database -------------------------------------------

  const upsert = useCallback((table: Table, record: SheetTab | SheetColumn | SheetRow) => {
    const key = TABLE_KEY[table];
    setWorkbook((current) => {
      const list = current[key] as { id: string }[];
      const next = list.some((item) => item.id === record.id)
        ? list.map((item) => (item.id === record.id ? record : item))
        : [...list, record];
      return sortWorkbook({ ...current, [key]: next });
    });
  }, []);

  const remove = useCallback((table: Table, id: string) => {
    const key = TABLE_KEY[table];
    setWorkbook((current) => ({ ...current, [key]: (current[key] as { id: string }[]).filter((item) => item.id !== id) }));
  }, []);

  const reload = useCallback(async () => {
    const [tabsResult, columnsResult, rowsResult] = await Promise.all([
      supabase.from("content_sheet_tabs").select("*").eq("workspace_id", workspaceId),
      supabase.from("content_sheet_columns").select("*").eq("workspace_id", workspaceId),
      supabase.from("content_sheet_rows").select("*").eq("workspace_id", workspaceId),
    ]);
    if (tabsResult.error || columnsResult.error || rowsResult.error) return;
    setWorkbook(sortWorkbook({ tabs: tabsResult.data ?? [], columns: columnsResult.data ?? [], rows: rowsResult.data ?? [] }));
  }, [supabase, workspaceId]);

  // Live updates: every insert, change and removal anyone makes arrives here. After a dropped
  // connection the whole workbook is fetched again, so nothing missed in between is lost.
  useEffect(() => {
    let cancelled = false;
    let connectedBefore = false;
    const channel = supabase.channel(`content-sheet:${workspaceId}`);
    for (const table of Object.keys(TABLE_KEY) as Table[]) {
      for (const event of ["INSERT", "UPDATE"] as const) {
        channel.on(
          "postgres_changes",
          { event, schema: "public", table, filter: `workspace_id=eq.${workspaceId}` },
          (payload) => upsert(table, payload.new as SheetRow),
        );
      }
      channel.on("postgres_changes", { event: "DELETE", schema: "public", table }, (payload) => {
        const old = payload.old as { id?: string };
        if (old?.id) remove(table, old.id);
      });
    }
    void (async () => {
      const { data } = await supabase.auth.getSession();
      if (cancelled) return;
      if (data.session?.access_token) supabase.realtime.setAuth(data.session.access_token);
      channel.subscribe((status) => {
        if (cancelled) return;
        const connected = status === "SUBSCRIBED";
        setLive(connected);
        if (connected) {
          if (connectedBefore) void reload();
          connectedBefore = true;
        }
      });
    })();
    return () => {
      cancelled = true;
      void supabase.removeChannel(channel);
    };
  }, [supabase, workspaceId, upsert, remove, reload]);

  // ---- saving ----------------------------------------------------------------------------------

  // Runs a write; if the database refuses it, `revert` puts the screen back and the reason is shown.
  async function write(run: () => PromiseLike<{ error: { message: string } | null }>, revert: () => void) {
    setError(null);
    try {
      const { error: writeError } = await run();
      if (writeError) {
        revert();
        setError(writeError.message.includes("row-level security") ? "You don't have permission to change this." : writeError.message);
      }
    } catch {
      revert();
      setError("Couldn't reach the server, so that change wasn't saved. Please try again.");
    }
  }

  function offerUndo(label: string, run: () => void) {
    if (undoTimer.current) clearTimeout(undoTimer.current);
    setUndo({ label, run });
    undoTimer.current = setTimeout(() => setUndo(null), 8000);
  }

  function setCell(row: SheetRow, column: SheetColumn, value: string) {
    const previous = row.cells[column.id] ?? "";
    if (previous === value) return;
    const cells = { ...row.cells };
    if (value) cells[column.id] = value;
    else delete cells[column.id];
    upsert("content_sheet_rows", { ...row, cells, updated_by: currentUserId, updated_at: new Date().toISOString() });
    void write(
      () => supabase.rpc("set_content_sheet_cell", { p_row_id: row.id, p_column_id: column.id, p_value: value }),
      () => upsert("content_sheet_rows", row),
    );
  }

  function addRow(where: { before?: SheetRow; after?: SheetRow } = {}) {
    if (!activeTab) return;
    const index = where.before ? allRows.indexOf(where.before) : where.after ? allRows.indexOf(where.after) + 1 : allRows.length;
    const position = positionBetween(allRows[index - 1]?.position ?? null, allRows[index]?.position ?? null);
    const now = new Date().toISOString();
    const row: SheetRow = {
      id: crypto.randomUUID(),
      tab_id: activeTab.id,
      workspace_id: workspaceId,
      position,
      cells: {},
      created_by: currentUserId,
      updated_by: currentUserId,
      created_at: now,
      updated_at: now,
    };
    upsert("content_sheet_rows", row);
    void write(
      () =>
        supabase.from("content_sheet_rows").insert({
          id: row.id,
          tab_id: row.tab_id,
          workspace_id: workspaceId,
          position,
          created_by: currentUserId,
          updated_by: currentUserId,
        }),
      () => remove("content_sheet_rows", row.id),
    );
    if (columns[0]) setEditing({ kind: "cell", rowId: row.id, columnId: columns[0].id });
  }

  function deleteRow(row: SheetRow) {
    remove("content_sheet_rows", row.id);
    void write(
      () => supabase.from("content_sheet_rows").delete().eq("id", row.id),
      () => upsert("content_sheet_rows", row),
    );
    offerUndo("Row deleted.", () => {
      upsert("content_sheet_rows", row);
      void write(
        () =>
          supabase.from("content_sheet_rows").insert({
            id: row.id,
            tab_id: row.tab_id,
            workspace_id: row.workspace_id,
            position: row.position,
            cells: row.cells,
            created_by: row.created_by,
            updated_by: currentUserId,
          }),
        () => remove("content_sheet_rows", row.id),
      );
    });
  }

  function addColumn(where: { before?: SheetColumn; after?: SheetColumn } = {}) {
    if (!activeTab) return;
    const index = where.before ? columns.indexOf(where.before) : where.after ? columns.indexOf(where.after) + 1 : columns.length;
    const position = positionBetween(columns[index - 1]?.position ?? null, columns[index]?.position ?? null);
    const column: SheetColumn = {
      id: crypto.randomUUID(),
      tab_id: activeTab.id,
      workspace_id: workspaceId,
      name: `Column ${columns.length + 1}`,
      position,
      width: 180,
      created_at: new Date().toISOString(),
    };
    upsert("content_sheet_columns", column);
    void write(
      () =>
        supabase.from("content_sheet_columns").insert({
          id: column.id,
          tab_id: column.tab_id,
          workspace_id: workspaceId,
          name: column.name,
          position,
          width: column.width,
        }),
      () => remove("content_sheet_columns", column.id),
    );
    setEditing({ kind: "header", columnId: column.id });
  }

  function renameColumn(column: SheetColumn, name: string) {
    const trimmed = name.trim().slice(0, 120);
    if (trimmed === column.name) return;
    upsert("content_sheet_columns", { ...column, name: trimmed });
    void write(
      () => supabase.from("content_sheet_columns").update({ name: trimmed }).eq("id", column.id),
      () => upsert("content_sheet_columns", column),
    );
  }

  // The cells stay in the rows, so bringing the column back (Undo) brings its values back too.
  function deleteColumn(column: SheetColumn) {
    remove("content_sheet_columns", column.id);
    void write(
      () => supabase.from("content_sheet_columns").delete().eq("id", column.id),
      () => upsert("content_sheet_columns", column),
    );
    offerUndo(`Column "${column.name || "Untitled"}" deleted.`, () => {
      upsert("content_sheet_columns", column);
      void write(
        () =>
          supabase.from("content_sheet_columns").insert({
            id: column.id,
            tab_id: column.tab_id,
            workspace_id: column.workspace_id,
            name: column.name,
            position: column.position,
            width: column.width,
          }),
        () => remove("content_sheet_columns", column.id),
      );
    });
  }

  // A new tab (one per person) starts with the same column headings as the tab on screen.
  function addTab() {
    const now = new Date().toISOString();
    const tab: SheetTab = {
      id: crypto.randomUUID(),
      workspace_id: workspaceId,
      name: "New tab",
      position: positionBetween(tabs[tabs.length - 1]?.position ?? null, null),
      created_by: currentUserId,
      created_at: now,
      updated_at: now,
    };
    const copied: SheetColumn[] = (columns.length ? columns : [{ name: "Name", width: 180 }, { name: "Links", width: 260 }, { name: "Platform", width: 120 }]).map(
      (column, index) => ({
        id: crypto.randomUUID(),
        tab_id: tab.id,
        workspace_id: workspaceId,
        name: column.name,
        position: index + 1,
        width: column.width,
        created_at: now,
      }),
    );
    upsert("content_sheet_tabs", tab);
    copied.forEach((column) => upsert("content_sheet_columns", column));
    setChosenTabId(tab.id);
    setRenamingTabId(tab.id);
    void write(
      async () => {
        const created = await supabase
          .from("content_sheet_tabs")
          .insert({ id: tab.id, workspace_id: workspaceId, name: tab.name, position: tab.position, created_by: currentUserId });
        if (created.error) return created;
        return supabase.from("content_sheet_columns").insert(
          copied.map(({ id, tab_id, workspace_id, name, position, width }) => ({ id, tab_id, workspace_id, name, position, width })),
        );
      },
      () => remove("content_sheet_tabs", tab.id),
    );
  }

  function renameTab(tab: SheetTab, name: string) {
    const trimmed = name.trim().slice(0, 60);
    setRenamingTabId(null);
    if (!trimmed || trimmed === tab.name) return;
    upsert("content_sheet_tabs", { ...tab, name: trimmed });
    void write(
      () => supabase.from("content_sheet_tabs").update({ name: trimmed }).eq("id", tab.id),
      () => upsert("content_sheet_tabs", tab),
    );
  }

  function deleteTab(tab: SheetTab) {
    setConfirmDeleteTab(null);
    const snapshot = workbook;
    setWorkbook((current) => ({
      tabs: current.tabs.filter((item) => item.id !== tab.id),
      columns: current.columns.filter((item) => item.tab_id !== tab.id),
      rows: current.rows.filter((item) => item.tab_id !== tab.id),
    }));
    setChosenTabId(null);
    void write(
      () => supabase.from("content_sheet_tabs").delete().eq("id", tab.id),
      () => setWorkbook(snapshot),
    );
  }

  // ---- moving between cells while typing --------------------------------------------------------

  function moveFrom(row: SheetRow, column: SheetColumn, direction: "down" | "right" | "left") {
    const rowIndex = rows.findIndex((item) => item.id === row.id);
    const columnIndex = columns.findIndex((item) => item.id === column.id);
    if (direction === "down") {
      const next = rows[rowIndex + 1];
      setEditing(next ? { kind: "cell", rowId: next.id, columnId: column.id } : null);
    } else {
      const step = direction === "right" ? 1 : -1;
      const nextColumn = columns[columnIndex + step];
      if (nextColumn) setEditing({ kind: "cell", rowId: row.id, columnId: nextColumn.id });
      else {
        const nextRow = rows[rowIndex + step];
        const wrapColumn = step === 1 ? columns[0] : columns[columns.length - 1];
        setEditing(nextRow && wrapColumn ? { kind: "cell", rowId: nextRow.id, columnId: wrapColumn.id } : null);
      }
    }
  }

  const lastChange = allRows.reduce<SheetRow | null>(
    (latest, row) => (!latest || row.updated_at > latest.updated_at ? row : latest),
    null,
  );
  // Columns keep the width they had in Excel, but never so narrow that the heading and its menu don't fit.
  const shownWidth = (column: SheetColumn) => Math.max(column.width, 140);
  const tableWidth = 48 + columns.reduce((total, column) => total + shownWidth(column), 0) + 44;

  return (
    <section aria-label={WORKBOOK_TITLE} className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0">
          <h2 className="flex items-center gap-2 text-base font-semibold">
            {WORKBOOK_TITLE}
            <span
              className={cn(
                "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium",
                live ? "bg-emerald-500/15 text-emerald-400" : "bg-muted text-muted-foreground",
              )}
              title={live ? "Changes from everyone appear here as they happen." : "Connecting for live updates…"}
            >
              <span className={cn("h-1.5 w-1.5 rounded-full", live ? "bg-emerald-400" : "bg-muted-foreground")} />
              {live ? "Live" : "Connecting…"}
            </span>
          </h2>
          <p className="text-xs text-muted-foreground">
            Everyone edits the same sheet. Changes save as you type and show up for the whole team.
            {lastChange ? (
              <span suppressHydrationWarning>
                {" "}
                Last change
                {lastChange.updated_by && people[lastChange.updated_by] ? ` by ${people[lastChange.updated_by]}` : ""}{" "}
                {formatDistanceToNowStrict(new Date(lastChange.updated_at), { addSuffix: true })}.
              </span>
            ) : null}
          </p>
        </div>
        <div className="flex w-full flex-wrap items-center gap-2 sm:w-auto">
          <label className="relative flex-1 sm:w-56 sm:flex-none">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <input
              value={filter}
              onChange={(event) => setFilter(event.target.value)}
              placeholder="Filter rows…"
              aria-label="Filter rows"
              className="h-9 w-full rounded-md border border-border bg-background pl-8 pr-2 text-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            />
          </label>
          {/* A plain link, so the download works on phones and in in-app browsers too. */}
          <a
            href={exportUrl}
            className="inline-flex h-9 items-center gap-1.5 rounded-md border border-border bg-card px-3 text-sm font-medium transition-colors hover:bg-muted"
          >
            <Download className="h-4 w-4" />
            Download as Excel
          </a>
        </div>
      </div>

      {/* One tab per person. */}
      <div className="-mx-1 flex items-center gap-1 overflow-x-auto px-1 pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden" role="tablist" aria-label="Tabs">
        {tabs.map((tab) => {
          const active = tab.id === activeTab?.id;
          if (renamingTabId === tab.id) {
            return (
              <input
                key={tab.id}
                autoFocus
                defaultValue={tab.name}
                aria-label="Tab name"
                maxLength={60}
                onFocus={(event) => event.currentTarget.select()}
                onBlur={(event) => renameTab(tab, event.currentTarget.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter") event.currentTarget.blur();
                  if (event.key === "Escape") setRenamingTabId(null);
                }}
                className="h-9 w-40 shrink-0 rounded-md border border-primary bg-background px-3 text-sm focus-visible:outline-none"
              />
            );
          }
          return (
            <div
              key={tab.id}
              className={cn(
                "flex h-9 shrink-0 items-center rounded-md border text-sm font-medium transition-colors",
                active ? "border-primary bg-primary/10 text-foreground" : "border-border bg-card text-muted-foreground hover:text-foreground",
              )}
            >
              <button
                type="button"
                role="tab"
                aria-selected={active}
                onClick={() => setChosenTabId(tab.id)}
                onDoubleClick={() => setRenamingTabId(tab.id)}
                className="h-full px-3"
                title="Double-click to rename"
              >
                {tab.name}
              </button>
              {active ? (
                <DropdownMenu modal={false}>
                  <DropdownMenuTrigger
                    aria-label={`Options for tab ${tab.name}`}
                    className="grid h-full w-7 place-items-center border-l border-border/60 text-muted-foreground hover:text-foreground"
                  >
                    <ChevronDown className="h-3.5 w-3.5" />
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="start">
                    <DropdownMenuItem onSelect={() => setRenamingTabId(tab.id)}>
                      <Pencil />
                      Rename tab
                    </DropdownMenuItem>
                    <DropdownMenuItem onSelect={() => setConfirmDeleteTab(tab.id)} className="text-destructive">
                      <Trash2 />
                      Delete tab…
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              ) : null}
            </div>
          );
        })}
        <button
          type="button"
          onClick={addTab}
          className="inline-flex h-9 shrink-0 items-center gap-1 rounded-md border border-dashed border-border px-3 text-sm text-muted-foreground transition-colors hover:border-primary/50 hover:text-foreground"
        >
          <Plus className="h-4 w-4" />
          New tab
        </button>
      </div>

      {confirmDeleteTab && activeTab && confirmDeleteTab === activeTab.id ? (
        <div role="alert" className="flex flex-wrap items-center justify-between gap-2 border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm">
          <span>
            Delete the tab <strong>{activeTab.name}</strong> and its {allRows.length} {allRows.length === 1 ? "row" : "rows"} for everyone?
            This can&apos;t be undone.
          </span>
          <span className="flex gap-2">
            <Button type="button" size="sm" variant="outline" onClick={() => setConfirmDeleteTab(null)}>
              Cancel
            </Button>
            <Button type="button" size="sm" variant="destructive" onClick={() => deleteTab(activeTab)}>
              Delete tab
            </Button>
          </span>
        </div>
      ) : null}

      {error ? (
        <div role="alert" className="flex items-start justify-between gap-3 border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm">
          <span>{error}</span>
          <button type="button" onClick={() => setError(null)} className="shrink-0 text-xs text-muted-foreground hover:text-foreground">
            Dismiss
          </button>
        </div>
      ) : null}

      {!activeTab ? (
        <div className="rounded-lg border border-dashed border-border px-6 py-12 text-center text-sm text-muted-foreground">
          No tabs yet. Use <strong>New tab</strong> to start one.
        </div>
      ) : (
        <div className="overflow-hidden rounded-lg border border-border bg-card">
          <div className="max-h-[calc(100dvh-20rem)] min-h-[16rem] overflow-auto overscroll-contain">
            {/* Fills the box; the last, empty column takes up any spare width. */}
            <table className="w-full table-fixed border-separate border-spacing-0 text-sm" style={{ minWidth: tableWidth }}>
              <colgroup>
                <col style={{ width: 48 }} />
                {columns.map((column) => (
                  <col key={column.id} style={{ width: shownWidth(column) }} />
                ))}
                <col />
              </colgroup>
              <thead>
                <tr>
                  <th className="sticky left-0 top-0 z-30 border-b border-r border-border bg-muted px-2 py-2 text-right text-[11px] font-medium text-muted-foreground">
                    #
                  </th>
                  {columns.map((column, index) => (
                    <th key={column.id} className="group sticky top-0 z-20 border-b border-r border-border bg-muted p-0 text-left">
                      {editing?.kind === "header" && editing.columnId === column.id ? (
                        <input
                          autoFocus
                          defaultValue={column.name}
                          aria-label="Column name"
                          maxLength={120}
                          onFocus={(event) => event.currentTarget.select()}
                          onBlur={(event) => {
                            renameColumn(column, event.currentTarget.value);
                            setEditing(null);
                          }}
                          onKeyDown={(event) => {
                            if (event.key === "Enter") event.currentTarget.blur();
                            if (event.key === "Escape") setEditing(null);
                          }}
                          className="h-9 w-full bg-background px-2 text-sm font-semibold outline-none ring-2 ring-inset ring-primary"
                        />
                      ) : (
                        <div className="flex h-9 items-center">
                          <button
                            type="button"
                            onClick={() => setEditing({ kind: "header", columnId: column.id })}
                            className="min-w-0 flex-1 truncate px-2 text-left text-xs font-semibold uppercase tracking-wide"
                            title={`${column.name || "Untitled"} · click to rename`}
                          >
                            <span className="mr-1.5 text-[10px] font-normal text-muted-foreground">{String.fromCharCode(65 + (index % 26))}</span>
                            {column.name || <span className="text-muted-foreground">Untitled</span>}
                          </button>
                          <DropdownMenu modal={false}>
                            <DropdownMenuTrigger
                              aria-label={`Options for column ${column.name}`}
                              className="mr-1 grid h-7 w-6 shrink-0 place-items-center rounded-sm text-muted-foreground opacity-60 hover:bg-background hover:text-foreground hover:opacity-100 group-hover:opacity-100 data-[state=open]:opacity-100"
                            >
                              <MoreVertical className="h-3.5 w-3.5" />
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end">
                              <DropdownMenuItem onSelect={() => setEditing({ kind: "header", columnId: column.id })}>
                                <Pencil />
                                Rename column
                              </DropdownMenuItem>
                              <DropdownMenuItem onSelect={() => addColumn({ before: column })}>
                                <Plus />
                                Insert column left
                              </DropdownMenuItem>
                              <DropdownMenuItem onSelect={() => addColumn({ after: column })}>
                                <Plus />
                                Insert column right
                              </DropdownMenuItem>
                              <DropdownMenuSeparator />
                              <DropdownMenuItem onSelect={() => deleteColumn(column)} className="text-destructive">
                                <Trash2 />
                                Delete column
                              </DropdownMenuItem>
                            </DropdownMenuContent>
                          </DropdownMenu>
                        </div>
                      )}
                    </th>
                  ))}
                  <th className="sticky top-0 z-20 border-b border-border bg-muted p-0 text-left">
                    <button
                      type="button"
                      onClick={() => addColumn()}
                      aria-label="Add a column"
                      title="Add a column"
                      className="grid h-9 w-11 place-items-center text-muted-foreground hover:bg-background hover:text-foreground"
                    >
                      <Plus className="h-4 w-4" />
                    </button>
                  </th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => {
                  const number = allRows.indexOf(row) + 1;
                  return (
                    <tr key={row.id} className="group/row">
                      <td className="sticky left-0 z-10 border-b border-r border-border bg-card p-0 group-hover/row:bg-muted/60">
                        <DropdownMenu modal={false}>
                          <DropdownMenuTrigger
                            aria-label={`Options for row ${number}`}
                            className="flex h-9 w-full items-center justify-end gap-0.5 px-2 text-[11px] text-muted-foreground hover:text-foreground"
                          >
                            <MoreVertical className="h-3 w-3 opacity-0 group-hover/row:opacity-100" />
                            {number}
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="start">
                            <DropdownMenuItem onSelect={() => addRow({ before: row })}>
                              <ArrowUpToLine />
                              Insert row above
                            </DropdownMenuItem>
                            <DropdownMenuItem onSelect={() => addRow({ after: row })}>
                              <ArrowDownToLine />
                              Insert row below
                            </DropdownMenuItem>
                            <DropdownMenuSeparator />
                            <DropdownMenuItem onSelect={() => deleteRow(row)} className="text-destructive">
                              <Trash2 />
                              Delete row
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </td>
                      {columns.map((column) => (
                        <SheetCell
                          key={column.id}
                          value={row.cells[column.id] ?? ""}
                          editing={editing?.kind === "cell" && editing.rowId === row.id && editing.columnId === column.id}
                          onEdit={() => setEditing({ kind: "cell", rowId: row.id, columnId: column.id })}
                          onCommit={(value, move) => {
                            setCell(row, column, value);
                            if (move) moveFrom(row, column, move);
                            else setEditing(null);
                          }}
                          onCancel={() => setEditing(null)}
                        />
                      ))}
                      <td className="border-b border-border group-hover/row:bg-muted/60" />
                    </tr>
                  );
                })}
                {rows.length === 0 ? (
                  <tr>
                    <td colSpan={columns.length + 2} className="px-4 py-8 text-center text-sm text-muted-foreground">
                      {filter ? "No rows match the filter." : "No rows yet. Add one below."}
                    </td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>
          <div className="flex flex-wrap items-center justify-between gap-2 border-t border-border px-2 py-1.5">
            <Button type="button" variant="ghost" size="sm" onClick={() => addRow()} disabled={columns.length === 0}>
              <Plus className="h-4 w-4" />
              Add row
            </Button>
            <span className="pr-1 text-xs text-muted-foreground">
              {filter ? `${rows.length} of ${allRows.length} rows` : `${allRows.length} ${allRows.length === 1 ? "row" : "rows"}`} ·{" "}
              {columns.length} {columns.length === 1 ? "column" : "columns"}
            </span>
          </div>
        </div>
      )}

      {undo ? (
        <div role="status" className="fixed bottom-4 left-1/2 z-50 flex -translate-x-1/2 items-center gap-3 rounded-md border border-border bg-card px-4 py-2 text-sm shadow-lg">
          <span>{undo.label}</span>
          <button
            type="button"
            onClick={() => {
              undo.run();
              setUndo(null);
            }}
            className="font-semibold text-primary hover:underline"
          >
            Undo
          </button>
        </div>
      ) : null}
    </section>
  );
}

// One cell: shows its text (web addresses get an "open" button), and turns into a text box when
// clicked. Enter saves and goes down, Tab saves and goes right (Shift+Tab left), Escape cancels.
function SheetCell({
  value,
  editing,
  onEdit,
  onCommit,
  onCancel,
}: {
  value: string;
  editing: boolean;
  onEdit: () => void;
  onCommit: (value: string, move: "down" | "right" | "left" | null) => void;
  onCancel: () => void;
}) {
  const done = useRef(false);
  if (editing) {
    return (
      <td className="border-b border-r border-border p-0">
        <input
          autoFocus
          defaultValue={value}
          aria-label="Cell"
          maxLength={5000}
          onFocus={() => {
            done.current = false;
          }}
          onBlur={(event) => {
            if (!done.current) onCommit(event.currentTarget.value, null);
          }}
          onKeyDown={(event) => {
            if (event.key === "Enter" && !event.nativeEvent.isComposing) {
              event.preventDefault();
              done.current = true;
              onCommit(event.currentTarget.value, "down");
            } else if (event.key === "Tab") {
              event.preventDefault();
              done.current = true;
              onCommit(event.currentTarget.value, event.shiftKey ? "left" : "right");
            } else if (event.key === "Escape") {
              done.current = true;
              onCancel();
            }
          }}
          className="h-9 w-full bg-background px-2 text-sm outline-none ring-2 ring-inset ring-primary"
        />
      </td>
    );
  }
  const link = value && isWebAddress(value) ? value.trim() : null;
  return (
    <td className="border-b border-r border-border p-0 group-hover/row:bg-muted/60">
      <div className="flex h-9 items-center">
        <button
          type="button"
          onClick={onEdit}
          title={value || undefined}
          className={cn("h-full min-w-0 flex-1 truncate px-2 text-left", link && "text-primary")}
        >
          {value}
        </button>
        {link ? (
          <a
            href={link}
            target="_blank"
            rel="noopener noreferrer"
            aria-label="Open this link"
            title="Open this link"
            className="mr-1 grid h-7 w-7 shrink-0 place-items-center rounded-sm text-muted-foreground hover:bg-background hover:text-foreground"
          >
            <ExternalLink className="h-3.5 w-3.5" />
          </a>
        ) : null}
      </div>
    </td>
  );
}
