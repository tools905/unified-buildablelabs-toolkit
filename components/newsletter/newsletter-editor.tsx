"use client";

import { useCallback, useEffect, useMemo, useRef, useState, useTransition } from "react";
import Link from "next/link";
import {
  ChevronLeft,
  Image as ImageIcon,
  Link as LinkIcon,
  List,
  ListOrdered,
  Quote,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { SubmitButton } from "@/components/dashboard/submit-button";
import { cn } from "@/lib/utils/cn";
import { renderNewsletterMarkdown } from "@/lib/utils/markdown";
import { deletePostAction, publishPostAction, updatePostAction } from "@/app/tools/newsletter/actions";
import type { NewsletterMemberOption, NewsletterPost } from "@/components/newsletter/types";

type SaveState = "saved" | "saving" | "unsaved";

function wrapSelection(textarea: HTMLTextAreaElement, before: string, after = before) {
  const { selectionStart, selectionEnd, value } = textarea;
  const selected = value.slice(selectionStart, selectionEnd);
  const next = `${value.slice(0, selectionStart)}${before}${selected}${after}${value.slice(selectionEnd)}`;
  return { next, caretStart: selectionStart + before.length, caretEnd: selectionStart + before.length + selected.length };
}

function prefixLines(textarea: HTMLTextAreaElement, makePrefix: (lineIndex: number) => string) {
  const { selectionStart, selectionEnd, value } = textarea;
  const lineStart = value.lastIndexOf("\n", selectionStart - 1) + 1;
  const lineEnd = value.indexOf("\n", selectionEnd);
  const blockEnd = lineEnd === -1 ? value.length : lineEnd;
  const block = value.slice(lineStart, blockEnd);
  const lines = block.split("\n").map((line, i) => `${makePrefix(i)}${line}`);
  const next = `${value.slice(0, lineStart)}${lines.join("\n")}${value.slice(blockEnd)}`;
  return { next, caretStart: lineStart, caretEnd: lineStart + lines.join("\n").length };
}

export function NewsletterEditor({
  post,
  members,
  canDelete,
}: {
  post: NewsletterPost;
  members: NewsletterMemberOption[];
  canDelete: boolean;
}) {
  const [title, setTitle] = useState(post.title);
  const [deck, setDeck] = useState(post.deck ?? "");
  const [tag, setTag] = useState(post.tag ?? "");
  const [body, setBody] = useState(post.body);
  const [authorIds, setAuthorIds] = useState<string[]>(post.author_ids);
  const [addingAuthor, setAddingAuthor] = useState(false);
  const [saveState, setSaveState] = useState<SaveState>("saved");
  const [isPublishing, startPublishing] = useTransition();
  const [previewing, setPreviewing] = useState(false);

  const bodyRef = useRef<HTMLTextAreaElement>(null);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const latest = useRef({ title, deck, tag, body, authorIds });
  latest.current = { title, deck, tag, body, authorIds };

  const membersById = useMemo(() => Object.fromEntries(members.map((m) => [m.id, m])), [members]);
  const availableMembers = members.filter((m) => !authorIds.includes(m.id));

  const flushSave = useCallback(async () => {
    if (saveTimer.current) clearTimeout(saveTimer.current);
    setSaveState("saving");
    await updatePostAction(post.id, latest.current);
    setSaveState("saved");
  }, [post.id]);

  useEffect(() => {
    setSaveState("unsaved");
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => {
      flushSave();
    }, 900);
    return () => {
      if (saveTimer.current) clearTimeout(saveTimer.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [title, deck, tag, body, authorIds]);

  useEffect(() => {
    const textarea = bodyRef.current;
    if (!textarea) return;
    textarea.style.height = "auto";
    textarea.style.height = `${textarea.scrollHeight}px`;
  }, [body]);

  function applyToBody(mutate: (textarea: HTMLTextAreaElement) => { next: string; caretStart: number; caretEnd: number }) {
    const textarea = bodyRef.current;
    if (!textarea) return;
    const { next, caretStart, caretEnd } = mutate(textarea);
    setBody(next);
    requestAnimationFrame(() => {
      textarea.focus();
      textarea.setSelectionRange(caretStart, caretEnd);
    });
  }

  function handlePublish() {
    startPublishing(async () => {
      await flushSave();
      const formData = new FormData();
      formData.set("postId", post.id);
      await publishPostAction(formData);
    });
  }

  const statusLabel =
    post.status === "published"
      ? "Published"
      : post.status === "scheduled"
        ? "Issue Draft — Scheduled"
        : "Issue Draft — Unpublished";

  return (
    <div className="-m-4 flex min-h-[calc(100vh-1px)] flex-col sm:-m-6 lg:-m-10">
      <div className="flex items-center justify-between gap-3 border-b border-muted px-6 py-4 sm:px-8">
        <div className="flex items-center gap-3.5">
          <Link
            href="/tools/newsletter"
            aria-label="Back to posts"
            className="grid h-[34px] w-[34px] place-items-center border border-border text-chrome transition-colors hover:border-quiet hover:text-foreground"
          >
            <ChevronLeft className="h-3.5 w-3.5" />
          </Link>
          <div className="flex items-center gap-1.5">
            <span
              className={cn(
                "inline-block h-1.5 w-1.5 rounded-full",
                saveState === "saved" && "bg-emerald-500",
                saveState === "saving" && "animate-pulse bg-primary-hover",
                saveState === "unsaved" && "bg-quiet",
              )}
            />
            <span className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
              {saveState === "saved" ? "Draft saved" : saveState === "saving" ? "Saving…" : "Unsaved changes"}
            </span>
          </div>
        </div>
        <div className="flex gap-2.5">
          {canDelete && post.status === "draft" ? (
            <form action={deletePostAction}>
              <input type="hidden" name="postId" value={post.id} />
              <SubmitButton variant="ghost" className="text-destructive hover:bg-destructive/10">
                Delete
              </SubmitButton>
            </form>
          ) : null}
          <Button type="button" variant="outline" onClick={() => setPreviewing((value) => !value)}>
            {previewing ? "Edit" : "Preview"}
          </Button>
          <Button type="button" onClick={handlePublish} disabled={isPublishing}>
            {post.status === "published" ? "Republish" : "Publish"}
          </Button>
        </div>
      </div>

      <div
        className={cn(
          "flex items-center gap-3.5 border-b border-muted px-6 py-3 sm:px-8",
          previewing && "pointer-events-none opacity-40",
        )}
      >
        <button
          type="button"
          onClick={() => applyToBody((t) => wrapSelection(t, "**"))}
          className="grid h-[34px] w-[34px] place-items-center text-sm font-bold text-muted-foreground transition-colors hover:text-foreground"
          aria-label="Bold"
        >
          B
        </button>
        <button
          type="button"
          onClick={() => applyToBody((t) => wrapSelection(t, "_"))}
          className="grid h-[34px] w-[34px] place-items-center text-sm italic text-muted-foreground transition-colors hover:text-foreground"
          aria-label="Italic"
        >
          I
        </button>
        <button
          type="button"
          onClick={() => applyToBody((t) => wrapSelection(t, "~~"))}
          className="grid h-[34px] w-[34px] place-items-center text-sm line-through text-muted-foreground transition-colors hover:text-foreground"
          aria-label="Strikethrough"
        >
          S
        </button>
        <div className="h-5 w-px bg-border" />
        <button
          type="button"
          onClick={() => {
            const url = window.prompt("Link URL");
            if (!url) return;
            applyToBody((t) => wrapSelection(t, "[", `](${url})`));
          }}
          className="grid h-[34px] w-[34px] place-items-center text-muted-foreground transition-colors hover:text-foreground"
          aria-label="Insert link"
        >
          <LinkIcon className="h-3.5 w-3.5" />
        </button>
        <button
          type="button"
          onClick={() => {
            const url = window.prompt("Image URL");
            if (!url) return;
            applyToBody((t) => wrapSelection(t, "![", `](${url})`));
          }}
          className="grid h-[34px] w-[34px] place-items-center text-muted-foreground transition-colors hover:text-foreground"
          aria-label="Insert image"
        >
          <ImageIcon className="h-3.5 w-3.5" />
        </button>
        <button
          type="button"
          onClick={() => applyToBody((t) => prefixLines(t, () => "> "))}
          className="grid h-[34px] w-[34px] place-items-center font-serif italic text-base text-muted-foreground transition-colors hover:text-foreground"
          aria-label="Quote"
        >
          <Quote className="h-3.5 w-3.5" />
        </button>
        <div className="h-5 w-px bg-border" />
        <button
          type="button"
          onClick={() => applyToBody((t) => prefixLines(t, () => "- "))}
          className="grid h-[34px] w-[34px] place-items-center text-muted-foreground transition-colors hover:text-foreground"
          aria-label="Bullet list"
        >
          <List className="h-3.5 w-3.5" />
        </button>
        <button
          type="button"
          onClick={() => applyToBody((t) => prefixLines(t, (i) => `${i + 1}. `))}
          className="grid h-[34px] w-[34px] place-items-center text-muted-foreground transition-colors hover:text-foreground"
          aria-label="Numbered list"
        >
          <ListOrdered className="h-3.5 w-3.5" />
        </button>
      </div>

      <div className="flex flex-1 justify-center overflow-y-auto py-9">
        <div
          className="w-full max-w-[760px] px-8"
          style={{ background: "#F3EFE4", boxShadow: "0 24px 70px rgba(0,0,0,.4)", padding: "48px 56px" }}
        >
          <div
            className="mb-5 font-mono text-[9px] uppercase tracking-[0.16em]"
            style={{ color: "#A79E86" }}
          >
            {statusLabel}
          </div>
          {previewing ? (
            tag ? (
              <div
                className="mb-2 font-mono text-[10px] font-semibold uppercase tracking-[0.13em]"
                style={{ color: "#8A7F5E" }}
              >
                {tag}
              </div>
            ) : null
          ) : (
            <input
              value={tag}
              onChange={(event) => setTag(event.target.value)}
              placeholder="Desk (e.g. Systems Desk)"
              className="mb-2 w-full border-0 bg-transparent font-mono text-[10px] font-semibold uppercase tracking-[0.13em] outline-none placeholder:opacity-60"
              style={{ color: "#8A7F5E" }}
            />
          )}
          {previewing ? (
            <h1 className="font-serif text-[42px] leading-tight" style={{ color: "#1A1712" }}>
              {title || "Headline"}
            </h1>
          ) : (
            <input
              value={title}
              onChange={(event) => setTitle(event.target.value)}
              placeholder="Headline"
              className="w-full border-0 bg-transparent font-serif text-[42px] outline-none placeholder:opacity-60"
              style={{ color: "#1A1712" }}
            />
          )}
          {previewing ? (
            deck ? (
              <p className="mt-2.5 font-serif text-lg italic" style={{ color: "#6B6250" }}>
                {deck}
              </p>
            ) : null
          ) : (
            <input
              value={deck}
              onChange={(event) => setDeck(event.target.value)}
              placeholder="Add a deck…"
              className="mt-2.5 w-full border-0 bg-transparent font-serif text-lg italic outline-none placeholder:opacity-60"
              style={{ color: "#6B6250" }}
            />
          )}
          <div className="mt-5 flex flex-wrap items-center gap-2">
            {authorIds.map((id) => (
              <span
                key={id}
                className="inline-flex items-center gap-1.5 py-1 pl-3 pr-1.5 text-xs font-semibold"
                style={{ background: "#E7E1CF", color: "#3A3527" }}
              >
                {membersById[id]?.label ?? "Unknown"}
                {!previewing ? (
                  <button
                    type="button"
                    onClick={() => setAuthorIds((ids) => ids.filter((existing) => existing !== id))}
                    aria-label="Remove author"
                    className="grid h-4 w-4 place-items-center"
                  >
                    <X className="h-2.5 w-2.5" />
                  </button>
                ) : null}
              </span>
            ))}
            {!previewing && availableMembers.length > 0 ? (
              addingAuthor ? (
                <select
                  autoFocus
                  defaultValue=""
                  onChange={(event) => {
                    if (event.target.value) setAuthorIds((ids) => [...ids, event.target.value]);
                    setAddingAuthor(false);
                  }}
                  onBlur={() => setAddingAuthor(false)}
                  className="h-[22px] border text-xs"
                  style={{ borderColor: "#C9C0A6", color: "#6B6250", background: "transparent" }}
                >
                  <option value="" disabled>
                    Add author…
                  </option>
                  {availableMembers.map((member) => (
                    <option key={member.id} value={member.id}>
                      {member.label}
                    </option>
                  ))}
                </select>
              ) : (
                <button
                  type="button"
                  onClick={() => setAddingAuthor(true)}
                  aria-label="Add author"
                  className="grid h-[22px] w-[22px] place-items-center border text-sm leading-none"
                  style={{ borderColor: "#C9C0A6", color: "#6B6250" }}
                >
                  +
                </button>
              )
            ) : null}
          </div>
          <div className="my-6 h-px" style={{ background: "#DCD5C0" }} />
          {previewing ? (
            <div
              className="newsletter-preview text-[15px] leading-[1.8]"
              style={{ color: "#4A4436" }}
              dangerouslySetInnerHTML={{ __html: renderNewsletterMarkdown(body) || "<p>Nothing written yet.</p>" }}
            />
          ) : (
            <textarea
              ref={bodyRef}
              value={body}
              onChange={(event) => setBody(event.target.value)}
              placeholder="Start writing your story…"
              rows={8}
              className="w-full resize-none border-0 bg-transparent text-[15px] leading-[1.8] outline-none placeholder:opacity-60"
              style={{ color: "#4A4436" }}
            />
          )}
        </div>
      </div>
    </div>
  );
}
