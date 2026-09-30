"use client";

import { useState } from "react";
import { ExternalLink, Plus, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { MAX_REFERENCE_LINKS } from "@/lib/utils/content-board";

function openableUrl(value: string) {
  try {
    const url = new URL(value.trim());
    return url.protocol === "https:" ? url.toString() : null;
  } catch {
    return null;
  }
}

// A list of link boxes for reference posts. Every box is submitted with the form as
// `referenceLinks`; blank ones are ignored by the server. A valid link gets an
// "open" button so it can be checked in a new tab before saving.
export function ReferenceLinksField({ initial = [] }: { initial?: string[] }) {
  const [links, setLinks] = useState<string[]>(initial.length ? initial : [""]);

  function update(index: number, value: string) {
    setLinks((current) => current.map((link, i) => (i === index ? value : link)));
  }

  function remove(index: number) {
    setLinks((current) => {
      const next = current.filter((_, i) => i !== index);
      return next.length ? next : [""];
    });
  }

  return (
    <div>
      <Label htmlFor="referenceLinks-0">Reference posts (optional)</Label>
      <div className="mt-2 space-y-2">
        {links.map((link, index) => {
          const href = openableUrl(link);
          return (
            <div key={index} className="flex items-center gap-1">
              <Input
                id={`referenceLinks-${index}`}
                name="referenceLinks"
                type="url"
                inputMode="url"
                placeholder="https://…"
                value={link}
                onChange={(event) => update(index, event.target.value)}
                aria-label={`Reference link ${index + 1}`}
              />
              {href ? (
                <a
                  href={href}
                  target="_blank"
                  rel="noopener noreferrer"
                  aria-label={`Open reference link ${index + 1} in a new tab`}
                  title="Open in a new tab"
                  className="inline-flex h-10 w-10 shrink-0 items-center justify-center text-muted-foreground transition-colors hover:text-primary"
                >
                  <ExternalLink className="h-4 w-4" />
                </a>
              ) : null}
              {links.length > 1 || link ? (
                <button
                  type="button"
                  onClick={() => remove(index)}
                  aria-label={`Remove reference link ${index + 1}`}
                  className="inline-flex h-10 w-8 shrink-0 items-center justify-center text-muted-foreground transition-colors hover:text-destructive"
                >
                  <X className="h-4 w-4" />
                </button>
              ) : null}
            </div>
          );
        })}
      </div>
      {links.length < MAX_REFERENCE_LINKS ? (
        <Button type="button" variant="ghost" size="sm" className="mt-1" onClick={() => setLinks((current) => [...current, ""])}>
          <Plus className="h-4 w-4" />
          Add another link
        </Button>
      ) : null}
    </div>
  );
}
