"use client";

import { useMemo, useState } from "react";
import { FileText, Link2, Paperclip, Plus, Search, Sparkles, UserPlus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { CandidateForm } from "@/components/talent/candidate-form";
import { CandidatePanel } from "@/components/talent/candidate-panel";
import { FormLinkDialog } from "@/components/talent/form-link-dialog";
import { Avatar } from "@/components/talent/avatar";
import type { TalentCandidate } from "@/lib/services/talent-service";
import { daysUntilPurge, hostLabel, SHELVES, type TalentShelf } from "@/lib/utils/talent";
import { cn } from "@/lib/utils/cn";

// Talent Bank: four shelves with their counts, a search, and a card for each candidate. A card opens
// the candidate; "Add candidate" takes a resume and fills in what it can; "Application link" is the
// form candidates fill in themselves.
export function TalentBank({
  candidates,
  workspaceId,
  formLink,
  applyBase,
}: {
  candidates: TalentCandidate[];
  workspaceId: string;
  formLink: { token: string; active: boolean } | null;
  applyBase: string;
}) {
  const [shelf, setShelf] = useState<TalentShelf>("new");
  const [query, setQuery] = useState("");
  const [openId, setOpenId] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [linkOpen, setLinkOpen] = useState(false);

  const counts = useMemo(() => Object.fromEntries(SHELVES.map((item) => [item.key, candidates.filter((c) => c.shelf === item.key).length])), [candidates]);
  const shown = useMemo(() => {
    const words = query.trim().toLowerCase().split(/\s+/).filter(Boolean);
    return candidates
      .filter((candidate) => (words.length ? true : candidate.shelf === shelf))
      .filter((candidate) => {
        const haystack = [candidate.full_name, candidate.role, candidate.location, candidate.email, candidate.source, candidate.notes].join(" ").toLowerCase();
        return words.every((word) => haystack.includes(word));
      });
  }, [candidates, shelf, query]);
  const open = candidates.find((candidate) => candidate.id === openId) ?? null;

  return (
    <div>
      {/* The shelves, as tiles with their counts. */}
      <div className="grid grid-cols-2 gap-2 lg:grid-cols-4" role="tablist" aria-label="Shelves">
        {SHELVES.map((item) => {
          const on = shelf === item.key && !query.trim();
          return (
            <button
              key={item.key}
              type="button"
              role="tab"
              aria-selected={on}
              onClick={() => {
                setShelf(item.key);
                setQuery("");
              }}
              className={cn(
                "group relative overflow-hidden border p-3.5 text-left transition-colors",
                on ? "border-primary-hover/70 bg-primary/10" : "border-border bg-card hover:border-primary/40",
              )}
            >
              {on ? <span aria-hidden className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-primary-hover to-transparent" /> : null}
              <span className="flex items-baseline justify-between gap-2">
                <span className={cn("text-sm font-medium", item.key === "rejected" && !on && "text-muted-foreground")}>{item.label}</span>
                <span className="font-mono text-2xl tabular-nums">{counts[item.key]}</span>
              </span>
              <span className="mt-1 block text-[11px] leading-snug text-muted-foreground">{item.hint}</span>
            </button>
          );
        })}
      </div>

      <div className="mt-5 flex flex-wrap items-center gap-2">
        <div className="relative min-w-[14rem] flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search every shelf: name, role, city, email…" className="pl-9" />
        </div>
        <Button type="button" variant="outline" className="gap-2" onClick={() => setLinkOpen(true)}>
          <Link2 className="h-4 w-4" />
          Application link
          <span className={cn("h-1.5 w-1.5 rounded-full", formLink?.active ? "bg-emerald-400" : "bg-quiet")} aria-label={formLink?.active ? "on" : "off"} />
        </Button>
        <Button type="button" className="gap-2" onClick={() => setAdding(true)}>
          <UserPlus className="h-4 w-4" />
          Add candidate
        </Button>
      </div>

      {query.trim() ? <p className="mt-3 text-xs text-muted-foreground">{shown.length} found across all shelves</p> : null}

      {shown.length === 0 ? (
        <div className="mt-6 grid place-items-center border border-dashed border-border px-6 py-16 text-center">
          <Sparkles className="h-7 w-7 text-quiet" />
          <p className="mt-3 font-medium">{query.trim() ? "Nobody matches that" : `No one on ${SHELVES.find((item) => item.key === shelf)?.label} yet`}</p>
          {!query.trim() && shelf === "new" ? (
            <p className="mt-1 max-w-sm text-sm text-muted-foreground">
              Add someone by hand, or share the application link and let people come to you.
            </p>
          ) : null}
          {!query.trim() && shelf === "new" ? (
            <div className="mt-4 flex gap-2">
              <Button type="button" size="sm" className="gap-1.5" onClick={() => setAdding(true)}>
                <Plus className="h-3.5 w-3.5" />
                Add candidate
              </Button>
              <Button type="button" size="sm" variant="outline" onClick={() => setLinkOpen(true)}>
                Share the link
              </Button>
            </div>
          ) : null}
        </div>
      ) : (
        <ul className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {shown.map((candidate) => {
            const resume = candidate.files.find((file) => file.kind === "resume");
            const work = candidate.files.filter((file) => file.kind === "work").length;
            return (
              <li key={candidate.id}>
                <button
                  type="button"
                  onClick={() => setOpenId(candidate.id)}
                  className="card-shadow group flex h-full w-full flex-col border border-border bg-card p-4 text-left transition-colors hover:border-primary/50"
                >
                  <span className="flex items-start gap-3">
                    <Avatar name={candidate.full_name} />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate font-medium group-hover:text-primary-hover">{candidate.full_name}</span>
                      <span className="block truncate text-xs text-muted-foreground">
                        {[candidate.role, candidate.location].filter(Boolean).join(" · ") || "No role or city yet"}
                      </span>
                    </span>
                    {candidate.added_via === "form" ? (
                      <span className="shrink-0 border border-primary/40 bg-primary/10 px-1.5 py-0.5 font-mono text-[10px] uppercase tracking-wider text-[#a9b8ff]">Applied</span>
                    ) : null}
                  </span>
                  <span className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-muted-foreground">
                    {resume ? (
                      <span className="flex items-center gap-1 text-chrome">
                        <FileText className="h-3.5 w-3.5" />
                        Resume
                      </span>
                    ) : null}
                    {work ? (
                      <span className="flex items-center gap-1">
                        <Paperclip className="h-3.5 w-3.5" />
                        {work} work {work === 1 ? "file" : "files"}
                      </span>
                    ) : null}
                    {candidate.links.slice(0, 2).map((link) => (
                      <span key={link} className="truncate">
                        {hostLabel(link)}
                      </span>
                    ))}
                  </span>
                  <span className="mt-auto flex items-center justify-between gap-2 pt-3 text-[11px] text-quiet">
                    <span suppressHydrationWarning>Added {new Date(candidate.created_at).toLocaleDateString("en-IN", { day: "numeric", month: "short" })}</span>
                    {candidate.shelf === "rejected" && candidate.rejected_at ? (
                      <span className="text-amber-400" suppressHydrationWarning>
                        Deleted in {daysUntilPurge(candidate.rejected_at)} days
                      </span>
                    ) : query.trim() ? (
                      <span>{SHELVES.find((item) => item.key === candidate.shelf)?.label}</span>
                    ) : null}
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      )}

      {open ? <CandidatePanel candidate={open} workspaceId={workspaceId} onClose={() => setOpenId(null)} /> : null}
      {adding ? <CandidateForm workspaceId={workspaceId} onClose={() => setAdding(false)} /> : null}
      {linkOpen ? <FormLinkDialog link={formLink} applyBase={applyBase} onClose={() => setLinkOpen(false)} /> : null}
    </div>
  );
}
