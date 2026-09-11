"use client";

import { useEffect, useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { ConfirmButton } from "@/components/dashboard/confirm-button";
import { Input } from "@/components/ui/input";
import { linkLinearIssueAction, searchLinearIssuesAction, unlinkLinearIssueAction } from "@/app/tools/tickets/actions";
import type { LinearIssue } from "@/lib/services/linear-client";
import type { TicketWithRelations } from "@/components/tickets/types";

const SEARCH_DEBOUNCE_MS = 300;

export function LinearLinkPanel({ ticket }: { ticket: TicketWithRelations }) {
  const [pending, startTransition] = useTransition();
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<LinearIssue[]>([]);
  const [searching, setSearching] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!query.trim()) return;
    let active = true;
    const timer = setTimeout(() => {
      setSearching(true);
      searchLinearIssuesAction(query)
        .then((issues) => {
          if (active) setResults(issues);
        })
        .catch((err) => {
          if (active) setError(err instanceof Error ? err.message : "Search failed.");
        })
        .finally(() => {
          if (active) setSearching(false);
        });
    }, SEARCH_DEBOUNCE_MS);
    return () => {
      active = false;
      clearTimeout(timer);
    };
  }, [query]);

  const visibleResults = query.trim() ? results : [];

  if (ticket.linear_issue_id && ticket.linear_issue_url) {
    return (
      <div className="rounded-md border border-border bg-muted/20 p-4">
        <h3 className="text-sm font-semibold">Linear</h3>
        <div className="mt-2 flex items-center justify-between gap-3">
          <a
            href={ticket.linear_issue_url}
            target="_blank"
            rel="noreferrer"
            className="text-sm font-medium text-primary underline underline-offset-2"
          >
            Open {ticket.linear_issue_identifier} in Linear ↗
          </a>
          <ConfirmButton
            type="button"
            variant="outline"
            size="sm"
            message={`Unlink ${ticket.linear_issue_identifier} from this ticket?`}
            disabled={pending}
            onClick={() => startTransition(() => unlinkLinearIssueAction(ticket.id))}
          >
            Unlink
          </ConfirmButton>
        </div>
        {ticket.linear_link_source === "auto_semantic" ? (
          <p className="mt-1 text-xs text-muted-foreground">
            Matched automatically by title similarity
            {ticket.linear_link_confidence != null ? ` (${Math.round(ticket.linear_link_confidence * 100)}% confidence)` : ""}
            — double-check this is the right issue.
          </p>
        ) : null}
      </div>
    );
  }

  return (
    <div className="rounded-md border border-border bg-muted/20 p-4">
      <h3 className="text-sm font-semibold">Linear</h3>
      <p className="mt-1 text-sm text-muted-foreground">
        Not linked to a Linear issue yet.
      </p>
      <Input
        value={query}
        onChange={(event) => setQuery(event.target.value)}
        placeholder="Search Linear issues…"
        className="mt-2 bg-card"
      />
      {error ? <p className="mt-2 text-sm text-destructive">{error}</p> : null}
      {searching ? <p className="mt-2 text-sm text-muted-foreground">Searching…</p> : null}
      {!searching && query.trim() && visibleResults.length === 0 ? (
        <p className="mt-2 text-sm text-muted-foreground">No matching issues found.</p>
      ) : null}
      {visibleResults.length > 0 ? (
        <ul className="mt-2 max-h-56 space-y-1 overflow-y-auto">
          {visibleResults.map((issue) => (
            <li
              key={issue.id}
              className="flex items-center justify-between gap-2 rounded-sm border border-border bg-card px-3 py-2 text-sm"
            >
              <div className="min-w-0">
                <p className="truncate font-medium">
                  {issue.identifier} — {issue.title}
                </p>
                {issue.state ? <p className="text-xs text-muted-foreground">{issue.state}</p> : null}
              </div>
              <Button
                type="button"
                size="sm"
                variant="outline"
                disabled={pending}
                onClick={() =>
                  startTransition(async () => {
                    try {
                      await linkLinearIssueAction(ticket.id, issue);
                      setQuery("");
                      setResults([]);
                    } catch (err) {
                      setError(err instanceof Error ? err.message : "Failed to link.");
                    }
                  })
                }
              >
                Link
              </Button>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
