"use client";

import { useState } from "react";
import { X } from "lucide-react";
import { MAX_POST_TAGS, MAX_TAG_LENGTH, normalizeTags } from "@/lib/utils/newsletter-tags";
import { originalUrlSchema } from "@/lib/validation/newsletter-schema";

// What the page needs to know about a typed link: whether it can be saved, and what to tell the writer.
export function checkOriginalUrl(value: string): { valid: boolean; error: string | null } {
  const parsed = originalUrlSchema.safeParse(value);
  if (parsed.success) return { valid: true, error: null };
  return { valid: false, error: parsed.error.issues[0]?.message ?? "That doesn't look like a web address." };
}

const PAPER_LINE = "#C9C0A6";
const PAPER_TEXT = "#6B6250";

// "For Medium and Substack": the details the other platforms ask for that the website doesn't use.
// Styled to sit on the cream page of the editor.
export function CapsuleFields({
  tags,
  onTagsChange,
  originalUrl,
  onOriginalUrlChange,
}: {
  tags: string[];
  onTagsChange: (tags: string[]) => void;
  originalUrl: string;
  onOriginalUrlChange: (value: string) => void;
}) {
  const [draftTag, setDraftTag] = useState("");
  const { error } = checkOriginalUrl(originalUrl);
  const full = tags.length >= MAX_POST_TAGS;

  function commit(raw: string) {
    // A pasted "a, b, c" becomes three tags.
    const next = normalizeTags([...tags, ...raw.split(",")]);
    if (next.length !== tags.length) onTagsChange(next);
    setDraftTag("");
  }

  return (
    <div className="mt-5 space-y-3 border p-4" style={{ borderColor: "#DCD5C0" }}>
      <div className="font-mono text-[9px] uppercase tracking-[0.16em]" style={{ color: "#A79E86" }}>
        For Medium &amp; Substack
      </div>

      <div>
        <label htmlFor="capsule-tags" className="mb-1 block text-xs font-semibold" style={{ color: PAPER_TEXT }}>
          Tags <span className="font-normal opacity-70">(up to {MAX_POST_TAGS})</span>
        </label>
        <div className="flex flex-wrap items-center gap-1.5">
          {tags.map((tag) => (
            <span
              key={tag}
              className="inline-flex items-center gap-1.5 py-1 pl-2.5 pr-1.5 text-xs font-semibold"
              style={{ background: "#E7E1CF", color: "#3A3527" }}
            >
              {tag}
              <button
                type="button"
                onClick={() => onTagsChange(tags.filter((existing) => existing !== tag))}
                aria-label={`Remove tag ${tag}`}
                className="grid h-4 w-4 place-items-center"
              >
                <X className="h-2.5 w-2.5" />
              </button>
            </span>
          ))}
          <input
            id="capsule-tags"
            value={draftTag}
            disabled={full}
            maxLength={MAX_TAG_LENGTH + 20}
            onChange={(event) => {
              const value = event.target.value;
              // A comma ends the tag, like pressing Enter.
              if (value.includes(",")) commit(value);
              else setDraftTag(value);
            }}
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                event.preventDefault();
                if (draftTag.trim()) commit(draftTag);
              } else if (event.key === "Backspace" && !draftTag && tags.length) {
                onTagsChange(tags.slice(0, -1));
              }
            }}
            onBlur={() => {
              if (draftTag.trim()) commit(draftTag);
            }}
            placeholder={full ? "That's the most Medium allows" : "Type a tag, press Enter"}
            className="min-w-[10rem] flex-1 border-0 bg-transparent py-1 text-xs outline-none placeholder:opacity-60 disabled:opacity-60"
            style={{ color: "#3A3527" }}
          />
        </div>
      </div>

      <div>
        <label htmlFor="capsule-original-url" className="mb-1 block text-xs font-semibold" style={{ color: PAPER_TEXT }}>
          Original link <span className="font-normal opacity-70">(where this post lives on our site)</span>
        </label>
        <input
          id="capsule-original-url"
          type="url"
          inputMode="url"
          value={originalUrl}
          onChange={(event) => onOriginalUrlChange(event.target.value)}
          placeholder="https://www.buildablelabs.com/…"
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? "capsule-original-url-error" : undefined}
          className="w-full border bg-transparent px-2.5 py-1.5 text-xs outline-none placeholder:opacity-60"
          style={{ borderColor: error ? "#DC2626" : PAPER_LINE, color: "#3A3527" }}
        />
        {error ? (
          <p id="capsule-original-url-error" role="alert" className="mt-1 text-xs" style={{ color: "#B91C1C" }}>
            {`${error.replace(/\.$/, "")}. It isn't saved until it is fixed.`}
          </p>
        ) : null}
      </div>
    </div>
  );
}
