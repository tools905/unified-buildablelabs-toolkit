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
import { CoverAdjustDialog } from "@/components/newsletter/cover-adjust-dialog";
import { CoverCardPreview, CoverImageField } from "@/components/newsletter/cover-image-field";
import { DEFAULT_COVER_ADJUST, type CoverAdjust } from "@/lib/utils/newsletter-cover";
import {
  findStoryImageAt,
  formatStoryImage,
  STORY_IMAGE_ALIGNS,
  STORY_IMAGE_SIZES,
  type StoryImage,
} from "@/lib/utils/newsletter-story-image";
import { isImageFile, removeNewsletterImage, uploadNewsletterImage } from "@/components/newsletter/newsletter-images";
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
  const [coverUrl, setCoverUrl] = useState<string | null>(post.cover_image_url);
  const [coverBrightness, setCoverBrightness] = useState<number | null>(post.cover_brightness);
  const [coverAdjust, setCoverAdjust] = useState<CoverAdjust>({
    focusX: post.cover_focus_x ?? DEFAULT_COVER_ADJUST.focusX,
    focusY: post.cover_focus_y ?? DEFAULT_COVER_ADJUST.focusY,
    zoom: Number(post.cover_zoom ?? DEFAULT_COVER_ADJUST.zoom),
    fade: post.cover_fade ?? null,
  });
  const [adjustingCover, setAdjustingCover] = useState(false);
  const [activeImage, setActiveImage] = useState<{ start: number; end: number; image: StoryImage } | null>(null);
  const [uploadingCover, setUploadingCover] = useState(false);
  const [bodyUploads, setBodyUploads] = useState(0);
  const [imageError, setImageError] = useState<string | null>(null);
  const [coverError, setCoverError] = useState<string | null>(null);
  const [draggingBody, setDraggingBody] = useState(false);

  const bodyRef = useRef<HTMLTextAreaElement>(null);
  const bodyFileInput = useRef<HTMLInputElement>(null);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Files that were replaced or removed. They are deleted once the post has been saved
  // without them, so a published post never points at a file that is already gone.
  const staleImages = useRef<string[]>([]);
  const latest = useRef({
    title,
    deck,
    tag,
    body,
    authorIds,
    coverImageUrl: coverUrl,
    coverBrightness,
    coverFocusX: coverAdjust.focusX,
    coverFocusY: coverAdjust.focusY,
    coverZoom: coverAdjust.zoom,
    coverFade: coverAdjust.fade,
  });
  latest.current = {
    title,
    deck,
    tag,
    body,
    authorIds,
    coverImageUrl: coverUrl,
    coverBrightness,
    coverFocusX: Math.round(coverAdjust.focusX),
    coverFocusY: Math.round(coverAdjust.focusY),
    coverZoom: Math.round(coverAdjust.zoom * 100) / 100,
    coverFade: coverAdjust.fade,
  };

  const membersById = useMemo(() => Object.fromEntries(members.map((m) => [m.id, m])), [members]);
  const availableMembers = members.filter((m) => !authorIds.includes(m.id));

  const flushSave = useCallback(async () => {
    if (saveTimer.current) clearTimeout(saveTimer.current);
    setSaveState("saving");
    await updatePostAction(post.id, latest.current);
    const stale = staleImages.current.filter((url) => url !== latest.current.coverImageUrl);
    staleImages.current = [];
    stale.forEach((url) => void removeNewsletterImage(url));
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
  }, [title, deck, tag, body, authorIds, coverUrl, coverBrightness, coverAdjust]);

  // A file dropped outside a drop area would make the browser leave the editor and open the file.
  useEffect(() => {
    const stop = (event: DragEvent) => {
      if (Array.from(event.dataTransfer?.types ?? []).includes("Files")) event.preventDefault();
    };
    window.addEventListener("dragover", stop);
    window.addEventListener("drop", stop);
    return () => {
      window.removeEventListener("dragover", stop);
      window.removeEventListener("drop", stop);
    };
  }, []);

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

  async function handleCoverFile(file: File) {
    setCoverError(null);
    setUploadingCover(true);
    try {
      const { url, brightness } = await uploadNewsletterImage(file, post.workspace_id, post.id);
      if (coverUrl) staleImages.current.push(coverUrl);
      setCoverUrl(url);
      setCoverBrightness(brightness);
      setCoverAdjust(DEFAULT_COVER_ADJUST);
      setAdjustingCover(true);
    } catch (error) {
      setCoverError(error instanceof Error ? error.message : "Could not upload this image.");
    } finally {
      setUploadingCover(false);
    }
  }

  function handleCoverRemove() {
    if (coverUrl) staleImages.current.push(coverUrl);
    setCoverUrl(null);
    setCoverBrightness(null);
    setCoverAdjust(DEFAULT_COVER_ADJUST);
    setCoverError(null);
  }

  // Uploads images and writes them into the story at the cursor as they finish.
  async function insertBodyImages(files: File[]) {
    const images = files.filter(isImageFile);
    if (images.length === 0) return;
    setImageError(null);
    const caret = bodyRef.current?.selectionEnd ?? latest.current.body.length;
    const entries = images.map((file) => ({
      file,
      token: `![Uploading ${crypto.randomUUID().slice(0, 6)}…](uploading)`,
    }));
    setBody((current) => {
      const before = current.slice(0, caret);
      const after = current.slice(caret);
      // One blank line on each side, without piling up extra ones that are already there.
      const lead = before && !before.endsWith("\n\n") ? (before.endsWith("\n") ? "\n" : "\n\n") : "";
      const trail = !after ? "\n\n" : after.startsWith("\n\n") ? "" : after.startsWith("\n") ? "\n" : "\n\n";
      return `${before}${lead}${entries.map((entry) => entry.token).join("\n\n")}${trail}${after}`;
    });
    setBodyUploads((count) => count + entries.length);
    let firstUrl: string | null = null;
    await Promise.all(
      entries.map(async ({ file, token }) => {
        try {
          const { url } = await uploadNewsletterImage(file, post.workspace_id, post.id);
          const alt = file.name.replace(/\.[^.]+$/, "").replace(/[\[\]()]/g, "");
          firstUrl ??= url;
          setBody((current) => current.replace(token, `![${alt}](${url})`));
        } catch (error) {
          setBody((current) => current.replace(token, "").replace(/\n{3,}/g, "\n\n"));
          setImageError(error instanceof Error ? error.message : "Could not upload this image.");
        } finally {
          setBodyUploads((count) => count - 1);
        }
      }),
    );
    if (firstUrl) selectImageWithUrl(firstUrl);
  }

  // Shows the size and alignment bar while the cursor is on a story image line.
  function syncActiveImage() {
    const textarea = bodyRef.current;
    if (!textarea) return;
    setActiveImage(findStoryImageAt(textarea.value, textarea.selectionStart));
  }

  function changeActiveImage(change: Partial<Pick<StoryImage, "size" | "align">>) {
    if (!activeImage) return;
    const line = formatStoryImage({ ...activeImage.image, ...change });
    const start = activeImage.start;
    setBody((current) => `${current.slice(0, start)}${line}${current.slice(activeImage.end)}`);
    requestAnimationFrame(() => {
      const textarea = bodyRef.current;
      if (!textarea) return;
      textarea.focus();
      textarea.setSelectionRange(start, start);
      syncActiveImage();
    });
  }

  // Puts the cursor on the first image just added so its size options appear straight away.
  function selectImageWithUrl(url: string) {
    setTimeout(() => {
      const textarea = bodyRef.current;
      if (!textarea) return;
      const at = textarea.value.indexOf(url);
      if (at === -1) return;
      textarea.focus();
      textarea.setSelectionRange(at, at);
      syncActiveImage();
    }, 0);
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
          onClick={() => bodyFileInput.current?.click()}
          className="grid h-[34px] w-[34px] place-items-center text-muted-foreground transition-colors hover:text-foreground"
          aria-label="Insert image"
          title="Insert image (or drop one onto the story)"
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

      <input
        ref={bodyFileInput}
        type="file"
        multiple
        accept="image/png,image/jpeg,image/webp"
        className="hidden"
        onChange={(event) => {
          void insertBodyImages(Array.from(event.target.files ?? []));
          event.target.value = "";
        }}
      />
      {bodyUploads > 0 || imageError ? (
        <div
          role={imageError ? "alert" : "status"}
          className="border-b border-muted px-6 py-2 text-xs sm:px-8"
          style={{ color: imageError ? "#F87171" : undefined }}
        >
          {imageError ?? `Uploading ${bodyUploads} image${bodyUploads === 1 ? "" : "s"}…`}
        </div>
      ) : null}

      {activeImage && !previewing ? (
        <div className="flex flex-wrap items-center gap-x-6 gap-y-2 border-b border-muted px-6 py-2.5 text-xs sm:px-8" role="group" aria-label="Story image settings">
          <span className="font-mono uppercase tracking-widest text-muted-foreground">Story image</span>
          <div className="flex items-center gap-2">
            <span className="text-muted-foreground">Size</span>
            <div className="flex border border-border" role="radiogroup" aria-label="Image size">
              {STORY_IMAGE_SIZES.map((option) => (
                <button
                  key={option.value}
                  type="button"
                  role="radio"
                  aria-checked={activeImage.image.size === option.value}
                  onMouseDown={(event) => event.preventDefault()}
                  onClick={() => changeActiveImage({ size: option.value })}
                  className={cn(
                    "px-2.5 py-1 transition-colors",
                    activeImage.image.size === option.value ? "bg-primary text-primary-foreground" : "hover:bg-muted",
                  )}
                >
                  {option.label}
                </button>
              ))}
            </div>
          </div>
          <div className={cn("flex items-center gap-2", activeImage.image.size === "full" && "opacity-40")}>
            <span className="text-muted-foreground">Align</span>
            <div className="flex border border-border" role="radiogroup" aria-label="Image alignment">
              {STORY_IMAGE_ALIGNS.map((option) => (
                <button
                  key={option.value}
                  type="button"
                  role="radio"
                  aria-checked={activeImage.image.align === option.value}
                  disabled={activeImage.image.size === "full"}
                  onMouseDown={(event) => event.preventDefault()}
                  onClick={() => changeActiveImage({ align: option.value })}
                  className={cn(
                    "px-2.5 py-1 transition-colors",
                    activeImage.image.align === option.value && activeImage.image.size !== "full"
                      ? "bg-primary text-primary-foreground"
                      : "hover:bg-muted",
                  )}
                >
                  {option.label}
                </button>
              ))}
            </div>
          </div>
          {activeImage.image.size === "full" ? <span className="text-muted-foreground">Choose Small or Medium to align it.</span> : null}
        </div>
      ) : null}

      {adjustingCover && coverUrl ? (
        <CoverAdjustDialog
          url={coverUrl}
          brightness={coverBrightness}
          tag={tag}
          title={title}
          initial={coverAdjust}
          onApply={(next) => {
            setCoverAdjust(next);
            setAdjustingCover(false);
          }}
          onCancel={() => setAdjustingCover(false)}
        />
      ) : null}

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
            coverUrl ? (
              <div className="mb-6">
                <CoverCardPreview url={coverUrl} brightness={coverBrightness} adjust={coverAdjust} tag={tag} title={title} />
              </div>
            ) : null
          ) : (
            <CoverImageField
              url={coverUrl}
              brightness={coverBrightness}
              adjust={coverAdjust}
              tag={tag}
              title={title}
              uploading={uploadingCover}
              error={coverError}
              onFile={handleCoverFile}
              onAdjust={() => setAdjustingCover(true)}
              onRemove={handleCoverRemove}
            />
          )}
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
              placeholder="Start writing your story… drop images here to add them."
              rows={8}
              onSelect={syncActiveImage}
              onKeyUp={syncActiveImage}
              onClick={syncActiveImage}
              onDragOver={(event) => {
                if (!Array.from(event.dataTransfer.types).includes("Files")) return;
                event.preventDefault();
                setDraggingBody(true);
              }}
              onDragLeave={() => setDraggingBody(false)}
              onDrop={(event) => {
                setDraggingBody(false);
                const files = Array.from(event.dataTransfer.files);
                if (!files.some(isImageFile)) return;
                event.preventDefault();
                void insertBodyImages(files);
              }}
              onPaste={(event) => {
                const files = Array.from(event.clipboardData.files);
                if (!files.some(isImageFile)) return;
                event.preventDefault();
                void insertBodyImages(files);
              }}
              className="w-full resize-none border-0 bg-transparent text-[15px] leading-[1.8] outline-none placeholder:opacity-60"
              style={{
                color: "#4A4436",
                outline: draggingBody ? "2px dashed #0B3FDE" : "none",
                outlineOffset: 6,
              }}
            />
          )}
        </div>
      </div>
    </div>
  );
}
