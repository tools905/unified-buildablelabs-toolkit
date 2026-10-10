"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ChevronLeft,
  ChevronRight,
  Download,
  Eraser,
  Eye,
  EyeOff,
  Hand,
  Highlighter,
  Loader2,
  Minus,
  Plus,
  Redo2,
  Save,
  Send,
  Trash2,
  Undo2,
  X,
} from "lucide-react";
import { MarkupPage, type MarkupInput } from "@/components/content-board/markup/markup-page";
import { usePostSlides, type LoadedSlide } from "@/components/content-board/post-preview/use-post-slides";
import { ideaPdfUrl } from "@/components/content-board/idea-pdf";
import type { PanelAttachment } from "@/components/content-board/types";
import { BASE_PATH } from "@/lib/utils/app-url";
import { cn } from "@/lib/utils/cn";
import {
  describePages,
  eraseAt,
  HIGHLIGHTER_COLOR,
  MARKUP_PENS,
  markupPageKey,
  simplifyPoints,
  type MarkupReviewPage,
  type MarkupStroke,
} from "@/lib/utils/markup";
import { formatWhen } from "@/components/content-board/activity";

type Pages = Record<string, MarkupStroke[]>;

// Where a slide came from: the uploaded file and, for a PDF, which page.
function slidePlace(slide: LoadedSlide) {
  return { attachmentId: slide.place.attachmentId, pageNumber: slide.place.pageNumber };
}
const slideKey = (slide: LoadedSlide) => {
  const place = slidePlace(slide);
  return markupPageKey(place.attachmentId, place.pageNumber);
};

const storageKey = (ideaId: string, fileIds: string[]) => `tc-markup:${ideaId}:${fileIds.join(",")}`;

// The review in progress, as kept on this device: a copy of everything, and whether it has changes the
// server hasn't saved yet (`dirty`), so a crash or a dropped connection loses nothing.
type LocalCopy = { pages: Pages; note: string; dirty: boolean };

function readLocal(key: string): LocalCopy | null {
  try {
    const raw = window.localStorage.getItem(key);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<LocalCopy> | Pages;
    // Marks kept before reviews were saved to the server: just the pages, none of them saved.
    if (!("pages" in parsed) || typeof parsed.pages !== "object" || Array.isArray(parsed.pages)) {
      return { pages: parsed as Pages, note: "", dirty: true };
    }
    return { pages: (parsed.pages ?? {}) as Pages, note: typeof parsed.note === "string" ? parsed.note : "", dirty: Boolean(parsed.dirty) };
  } catch {
    return null;
  }
}

function writeLocal(key: string, copy: LocalCopy) {
  try {
    const hasMarks = Object.values(copy.pages).some((strokes) => strokes.length > 0);
    if (hasMarks || copy.note.trim() || copy.dirty) window.localStorage.setItem(key, JSON.stringify(copy));
    else window.localStorage.removeItem(key);
  } catch {
    // Storage can be unavailable (private browsing); the server copy still saves.
  }
}

function clearLocal(key: string) {
  try {
    window.localStorage.removeItem(key);
  } catch {
    // Nothing to clean up.
  }
}

type SaveState =
  | { kind: "idle" }
  | { kind: "saving" }
  | { kind: "saved"; at: string }
  | { kind: "offline" };

// How long after the last line the review saves itself, and how soon a failed save is tried again.
const AUTOSAVE_DELAY = 2000;
const RETRY_DELAY = 10000;
// A touch landing this soon after the Pencil lifts is a palm or wrist, not a finger moving the page.
const PALM_GRACE = 600;

function saveStatusText(state: SaveState) {
  if (state.kind === "saving") return "Saving…";
  if (state.kind === "saved") return `Saved ${formatWhen(state.at)}`;
  if (state.kind === "offline") return "Not saved yet: kept on this iPad";
  return "";
}

const MIN_ZOOM = 1;
const MAX_ZOOM = 5;
const clampZoom = (value: number) => Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, value));

// Full-screen review of one draft. "draw": mark the pages with the Apple Pencil (or a mouse) and submit.
// "view": look at a submitted review's marks on the pages they were drawn on.
export function MarkupReviewer(
  props:
    | {
        mode: "draw";
        ideaId: string;
        draftLabel: string;
        attachments: PanelAttachment[];
        // Called with the last save, when one is still on its way.
        onClose: (saving?: Promise<void>) => void;
        onSubmitted: () => void;
      }
    | {
        mode: "view";
        ideaId: string;
        draftLabel: string;
        attachments: PanelAttachment[];
        reviewId: string;
        reviewTitle: string;
        onClose: () => void;
      },
) {
  const { mode, ideaId, draftLabel, attachments, onClose } = props;
  const drawing = mode === "draw";
  const fileIds = useMemo(() => attachments.filter((item) => item.kind !== "link").map((item) => item.id), [attachments]);
  const { slides: allSlides, loading } = usePostSlides(attachments);
  const saveKey = storageKey(ideaId, fileIds);

  // ---- the marks -------------------------------------------------------------------------------
  const [pages, setPagesState] = useState<Pages>(() => (drawing ? (readLocal(saveKey)?.pages ?? {}) : {}));
  // The marks as they are right now, also between screen updates: a quick Pencil sweep can erase, lift
  // and undo before React has drawn the screen again, and every step must see the latest marks.
  const pagesRef = useRef(pages);
  const setPages = useCallback((next: Pages) => {
    pagesRef.current = next;
    setPagesState(next);
  }, []);
  const [history, setHistory] = useState<{ key: string; before: MarkupStroke[] }[]>([]);
  const [future, setFuture] = useState<{ key: string; before: MarkupStroke[] }[]>([]);
  const [restored, setRestored] = useState<{ at: string | null } | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  // Drawing waits for the review saved so far (if any); looking at a review waits for its marks.
  const [viewLoaded, setViewLoaded] = useState(false);

  // A submitted review's marks.
  useEffect(() => {
    if (props.mode !== "view") return;
    let cancelled = false;
    void (async () => {
      try {
        const response = await fetch(`${BASE_PATH}/api/content-board/reviews/${encodeURIComponent(props.reviewId)}`, { cache: "no-store" });
        if (!response.ok) throw new Error();
        const review = (await response.json()) as { pages: MarkupReviewPage[] };
        if (cancelled) return;
        setPages(Object.fromEntries(review.pages.map((page) => [markupPageKey(page.attachmentId, page.pageNumber), page.strokes])) as Pages);
        setViewLoaded(true);
      } catch {
        if (!cancelled) setLoadError("Couldn't load this review. Close it and try again.");
      }
    })();
    return () => {
      cancelled = true;
    };
    // The review to load never changes while this is open.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ---- saving as you go -------------------------------------------------------------------------
  // Every change is kept on this device straight away and saved to the server a moment later, privately
  // (nobody else sees it until Submit). If the server can't be reached, the copy here is saved as soon
  // as it can be, including next time the review is opened.
  const [note, setNoteState] = useState(() => (drawing ? (readLocal(saveKey)?.note ?? "") : ""));
  const noteRef = useRef(note);
  const [saveState, setSaveState] = useState<SaveState>({ kind: "idle" });
  const dirty = useRef(drawing ? Boolean(readLocal(saveKey)?.dirty) : false);
  const edits = useRef(0);
  const saving = useRef<Promise<void> | null>(null);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const finished = useRef(false);
  const flushRef = useRef<() => void>(() => undefined);
  const savedUrl = `${BASE_PATH}/api/content-board/ideas/${encodeURIComponent(ideaId)}/reviews/saved`;

  const markedPages = useCallback(
    (from: Pages) =>
      allSlides
        .map((slide, position) => ({ slide, position: position + 1, strokes: from[slideKey(slide)] ?? [] }))
        .filter((page) => page.strokes.length > 0)
        .map(({ slide, position, strokes }) => ({ ...slidePlace(slide), position, strokes })),
    [allSlides],
  );

  const saveBody = useCallback(
    () => JSON.stringify({ fileIds, note: noteRef.current, pages: markedPages(pagesRef.current) }),
    [fileIds, markedPages],
  );

  const saveNow = useCallback(async (): Promise<void> => {
    if (!drawing || finished.current) return;
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = null;
    // One save at a time; a change made meanwhile is saved straight after.
    if (saving.current) {
      await saving.current;
      if (dirty.current && !finished.current) return saveNow();
      return;
    }
    const editsAtStart = edits.current;
    setSaveState({ kind: "saving" });
    const run = (async () => {
      try {
        const response = await fetch(savedUrl, { method: "PUT", headers: { "Content-Type": "application/json" }, body: saveBody() });
        if (!response.ok) throw new Error();
        if (edits.current === editsAtStart) {
          dirty.current = false;
          writeLocal(saveKey, { pages: pagesRef.current, note: noteRef.current, dirty: false });
        }
        setSaveState({ kind: "saved", at: new Date().toISOString() });
      } catch {
        setSaveState({ kind: "offline" });
        if (!finished.current) saveTimer.current = setTimeout(() => void saveNow(), RETRY_DELAY);
      }
    })();
    saving.current = run;
    await run;
    saving.current = null;
    if (dirty.current && edits.current !== editsAtStart && !finished.current && !saveTimer.current) {
      saveTimer.current = setTimeout(() => void saveNow(), AUTOSAVE_DELAY);
    }
  }, [drawing, saveBody, saveKey, savedUrl]);

  // Something changed: keep it here now, save it to the server shortly.
  const edited = useCallback(() => {
    if (!drawing) return;
    edits.current += 1;
    dirty.current = true;
    writeLocal(saveKey, { pages: pagesRef.current, note: noteRef.current, dirty: true });
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => void saveNow(), AUTOSAVE_DELAY);
    setSaveState((state) => (state.kind === "offline" ? state : { kind: "idle" }));
  }, [drawing, saveKey, saveNow]);

  const setNote = (value: string) => {
    noteRef.current = value;
    setNoteState(value);
    edited();
  };

  // Opening: pick up the review saved so far. Changes on this device that never reached the server win
  // (they are the newest work); otherwise the server's copy does, so a review started on another device
  // carries on here.
  useEffect(() => {
    if (!drawing || loading) return;
    let cancelled = false;
    const controller = new AbortController();
    const giveUp = setTimeout(() => controller.abort(), 8000);
    void (async () => {
      const local = readLocal(saveKey);
      const localHasMarks = Boolean(local && Object.values(local.pages).some((strokes) => strokes.length > 0));
      try {
        const response = await fetch(`${savedUrl}?files=${fileIds.join(",")}`, { cache: "no-store", signal: controller.signal });
        if (!response.ok) throw new Error();
        const { saved } = (await response.json()) as {
          saved: { pages: { attachmentId: string; pageNumber: number; strokes: MarkupStroke[] }[]; note: string; updatedAt: string } | null;
        };
        if (cancelled) return;
        if (local?.dirty) {
          if (localHasMarks || local.note.trim()) setRestored({ at: null });
          void saveNow();
        } else if (saved) {
          const fromServer = Object.fromEntries(saved.pages.map((page) => [markupPageKey(page.attachmentId, page.pageNumber), page.strokes])) as Pages;
          setPages(fromServer);
          noteRef.current = saved.note ?? "";
          setNoteState(noteRef.current);
          writeLocal(saveKey, { pages: fromServer, note: noteRef.current, dirty: false });
          setSaveState({ kind: "saved", at: saved.updatedAt });
          setRestored({ at: saved.updatedAt });
        } else if (local) {
          // Saved before, and gone from the server since: submitted or cleared on another device.
          setPages({});
          noteRef.current = "";
          setNoteState("");
          clearLocal(saveKey);
        }
      } catch {
        if (cancelled) return;
        // Offline: carry on with the copy on this device, and save it when the connection is back.
        if (localHasMarks) setRestored({ at: null });
        if (local?.dirty) {
          setSaveState({ kind: "offline" });
          saveTimer.current = setTimeout(() => void saveNow(), RETRY_DELAY);
        }
      } finally {
        clearTimeout(giveUp);
        if (!cancelled) setViewLoaded(true);
      }
    })();
    return () => {
      cancelled = true;
      controller.abort();
      clearTimeout(giveUp);
    };
    // Runs once, when the pages have loaded.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [drawing, loading]);

  // Leaving (closing the tab, switching apps, the iPad locking): send what isn't saved yet. `keepalive`
  // lets the save finish after the page has gone, within the browser's size limit for that.
  useEffect(() => {
    if (!drawing) return;
    const flush = () => {
      if (!dirty.current || finished.current || saving.current) return;
      const body = saveBody();
      void fetch(savedUrl, { method: "PUT", headers: { "Content-Type": "application/json" }, body, keepalive: body.length < 60000 }).then(
        (response) => {
          if (response.ok && !finished.current) {
            dirty.current = false;
            writeLocal(saveKey, { pages: pagesRef.current, note: noteRef.current, dirty: false });
          }
        },
        () => undefined,
      );
    };
    flushRef.current = flush;
    const onHidden = () => document.visibilityState === "hidden" && flush();
    document.addEventListener("visibilitychange", onHidden);
    window.addEventListener("pagehide", flush);
    return () => {
      document.removeEventListener("visibilitychange", onHidden);
      window.removeEventListener("pagehide", flush);
    };
  }, [drawing, saveBody, saveKey, savedUrl]);

  // Closed some other way (the Back button): send what isn't saved yet on the way out.
  useEffect(
    () => () => {
      if (saveTimer.current) clearTimeout(saveTimer.current);
      saveTimer.current = null;
      flushRef.current();
    },
    [],
  );

  // In view mode only the pages that were marked are shown.
  const slides = useMemo(
    () => (drawing ? allSlides : allSlides.filter((slide) => (pages[slideKey(slide)] ?? []).length > 0)),
    [allSlides, drawing, pages],
  );
  const [index, setIndex] = useState(0);
  const current = slides[Math.min(index, Math.max(0, slides.length - 1))];
  const currentKey = current ? slideKey(current) : "";
  const markedPositions = allSlides
    .map((slide, position) => ((pages[slideKey(slide)] ?? []).length > 0 ? position + 1 : null))
    .filter((value): value is number => value !== null);

  function change(key: string, next: MarkupStroke[]) {
    const before = pagesRef.current[key] ?? [];
    setHistory((items) => [...items.slice(-199), { key, before }]);
    setFuture([]);
    setPages({ ...pagesRef.current, [key]: next });
    edited();
  }

  function undo() {
    const last = history[history.length - 1];
    if (!last) return;
    // Read the page now: the updaters below run later, after the marks have changed.
    const current = pagesRef.current[last.key] ?? [];
    setHistory((items) => items.slice(0, -1));
    setFuture((items) => [...items, { key: last.key, before: current }]);
    setPages({ ...pagesRef.current, [last.key]: last.before });
    edited();
  }

  function redo() {
    const next = future[future.length - 1];
    if (!next) return;
    const current = pagesRef.current[next.key] ?? [];
    setFuture((items) => items.slice(0, -1));
    setHistory((items) => [...items, { key: next.key, before: current }]);
    setPages({ ...pagesRef.current, [next.key]: next.before });
    edited();
  }

  // ---- tools -----------------------------------------------------------------------------------
  const [tool, setTool] = useState<MarkupInput>("pen");
  const [color, setColor] = useState<string>(MARKUP_PENS[0].color);
  const [fingerDraws, setFingerDraws] = useState(false);
  const [penSeen, setPenSeen] = useState(false);
  const [showMarks, setShowMarks] = useState(true);
  const drawingNow = useRef(false);
  // While the eraser is down: the page's strokes before it started, and whether anything was removed,
  // so one sweep of the eraser is one step to undo.
  const erasing = useRef<{ before: MarkupStroke[]; removed: boolean } | null>(null);

  // ---- fitting the page and zooming ------------------------------------------------------------
  const [stage, setStage] = useState({ width: 0, height: 0 });
  // Measures the page area as soon as it appears, and again whenever it changes size (rotating the
  // iPad, resizing the window).
  const stageRef = useCallback((element: HTMLDivElement | null) => {
    if (!element) return;
    const measure = () => setStage({ width: element.clientWidth, height: element.clientHeight });
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(element);
    return () => observer.disconnect();
  }, []);
  const [view, setView] = useState({ zoom: 1, x: 0, y: 0 });
  // The latest zoom, for gesture handlers that run before the screen has re-drawn.
  const viewRef = useRef(view);
  useEffect(() => {
    viewRef.current = view;
  }, [view]);
  const fit = useMemo(() => {
    if (!current || stage.width === 0) return { width: 0, height: 0 };
    const ratio = current.width / Math.max(1, current.height);
    const room = { width: Math.max(0, stage.width - 32), height: Math.max(0, stage.height - 32) };
    const width = Math.min(room.width, room.height * ratio);
    return { width: Math.round(width), height: Math.round(width / ratio) };
  }, [current, stage.width, stage.height]);

  const goTo = useCallback(
    (next: number) => {
      setIndex(Math.min(Math.max(0, next), Math.max(0, slides.length - 1)));
      setView({ zoom: 1, x: 0, y: 0 });
    },
    [slides.length],
  );

  // Fingers on the page: one finger moves a zoomed page (or swipes to the next page), two fingers zoom.
  const touches = useRef(new Map<number, { x: number; y: number }>());
  // When the Pencil last touched down or lifted, to tell a resting palm from a finger.
  const penAt = useRef(-Infinity);
  const gesture = useRef<{ startDistance: number; startZoom: number; startMid: { x: number; y: number }; startView: typeof view; startX: number; startY: number } | null>(null);

  function startGesture() {
    const points = [...touches.current.values()];
    const mid = points.length === 2 ? { x: (points[0].x + points[1].x) / 2, y: (points[0].y + points[1].y) / 2 } : points[0];
    gesture.current = {
      startDistance: points.length === 2 ? Math.hypot(points[0].x - points[1].x, points[0].y - points[1].y) : 0,
      startZoom: viewRef.current.zoom,
      startMid: mid,
      startView: viewRef.current,
      startX: points[0]?.x ?? 0,
      startY: points[0]?.y ?? 0,
    };
  }

  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if ((event.target as HTMLElement | null)?.tagName === "TEXTAREA") return;
      // Keys used here must not also reach the idea panel underneath (Escape would close it too).
      if (["Escape", "ArrowRight", "ArrowLeft"].includes(event.key)) event.stopPropagation();
      if (event.key === "Escape") requestClose();
      if (event.key === "ArrowRight") goTo(index + 1);
      if (event.key === "ArrowLeft") goTo(index - 1);
      if (drawing && (event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "z") {
        event.preventDefault();
        if (event.shiftKey) redo();
        else undo();
      }
    }
    window.addEventListener("keydown", onKey, true);
    const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey, true);
      document.body.style.overflow = overflow;
    };
  });

  // ---- submitting --------------------------------------------------------------------------------
  const [confirming, setConfirming] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  async function submit() {
    if (props.mode !== "draw") return;
    setSubmitting(true);
    setSubmitError(null);
    // No saving while submitting: a save landing after the submit would bring the saved copy back.
    finished.current = true;
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = null;
    if (saving.current) await saving.current;
    const marked = markedPages(pagesRef.current);
    try {
      const response = await fetch(`${BASE_PATH}/api/content-board/ideas/${encodeURIComponent(ideaId)}/reviews`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ fileIds, note: noteRef.current.trim() || undefined, pages: marked }),
      });
      const result = (await response.json().catch(() => ({}))) as { error?: string };
      if (!response.ok) throw new Error(result.error ?? "Couldn't submit the review. Please try again.");
      dirty.current = false;
      clearLocal(saveKey);
      props.onSubmitted();
    } catch (error) {
      // Not submitted: carry on saving as before, so nothing drawn is lost.
      finished.current = false;
      if (dirty.current) void saveNow();
      setSubmitError(
        error instanceof Error
          ? `${error.message} Your marks are saved and stay here.`
          : "Couldn't submit the review. Your marks are saved and stay here.",
      );
      setSubmitting(false);
    }
  }

  function requestClose() {
    // Everything is kept on this device and saved to the server; send what's left on the way out.
    const pending = dirty.current || saving.current ? saveNow() : undefined;
    onClose(pending);
  }

  const strokes = pages[currentKey] ?? [];
  const toolButton = "grid h-10 w-10 shrink-0 place-items-center rounded-md transition-colors";

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={drawing ? `Pencil review of ${draftLabel}` : props.reviewTitle}
      className="fixed inset-0 z-[70] flex select-none flex-col bg-neutral-900 text-white"
    >
      {/* Top bar */}
      <div className="flex shrink-0 items-center gap-2 border-b border-white/10 px-2 py-2 pt-[max(0.5rem,env(safe-area-inset-top))] sm:px-3">
        <button type="button" onClick={requestClose} aria-label="Close" className={cn(toolButton, "hover:bg-white/10")}>
          <X className="h-5 w-5" />
        </button>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold">{drawing ? `Pencil review · ${draftLabel}` : props.reviewTitle}</p>
          <p className="truncate text-[11px] text-white/60">
            {drawing
              ? saveState.kind === "offline"
                ? "Not saved yet: no connection. Your marks are kept on this iPad and save when it's back."
                : penSeen
                  ? "Draw with the Pencil. Saves as you go; Submit is after the last page."
                  : "Draw with the Apple Pencil or a mouse. Saves as you go; Submit is after the last page."
              : `${draftLabel} · marks on ${describePages(markedPositions)}`}
          </p>
        </div>
        {slides.length ? (
          <span className="hidden shrink-0 text-xs text-white/70 sm:inline">
            Page {Math.min(index, slides.length - 1) + 1} of {slides.length}
          </span>
        ) : null}
        {drawing ? (
          <>
            <span role="status" aria-live="polite" className={cn("hidden max-w-44 shrink-0 truncate text-right text-[11px] sm:inline", saveState.kind === "offline" ? "text-amber-300" : "text-white/60")}>
              {saveStatusText(saveState)}
            </span>
            <button
              type="button"
              onClick={() => void saveNow()}
              disabled={saveState.kind === "saving" || !viewLoaded}
              title={saveStatusText(saveState) || "Save your marks so far"}
              className="inline-flex h-10 shrink-0 items-center gap-2 rounded-md border border-white/20 px-3 text-sm font-semibold transition-colors hover:bg-white/10 disabled:opacity-60"
            >
              {saveState.kind === "saving" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
              {saveState.kind === "saving" ? "Saving…" : "Save"}
            </button>
          </>
        ) : (
          <>
            <button
              type="button"
              onClick={() => setShowMarks((value) => !value)}
              aria-pressed={showMarks}
              className="inline-flex h-10 shrink-0 items-center gap-1.5 rounded-md px-3 text-sm hover:bg-white/10"
            >
              {showMarks ? <Eye className="h-4 w-4" /> : <EyeOff className="h-4 w-4" />}
              <span className="hidden sm:inline">{showMarks ? "Marks on" : "Marks off"}</span>
            </button>
            <a
              href={ideaPdfUrl(ideaId, [], { review: props.reviewId })}
              rel="noopener"
              className="inline-flex h-10 shrink-0 items-center gap-1.5 rounded-md bg-primary px-3 text-sm font-semibold text-primary-foreground"
            >
              <Download className="h-4 w-4" />
              <span className="hidden sm:inline">Download PDF</span>
            </a>
          </>
        )}
      </div>

      {/* Tools */}
      {drawing ? (
        <div className="flex shrink-0 items-center gap-1 overflow-x-auto border-b border-white/10 px-2 py-1.5 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden" role="toolbar" aria-label="Drawing tools">
          {MARKUP_PENS.map((pen) => {
            const on = tool === "pen" && color === pen.color;
            return (
              <button
                key={pen.color}
                type="button"
                aria-label={`${pen.label} pen`}
                aria-pressed={on}
                onClick={() => {
                  setTool("pen");
                  setColor(pen.color);
                }}
                className={cn(toolButton, on ? "bg-white/15 ring-2 ring-white" : "hover:bg-white/10")}
              >
                <span className="h-5 w-5 rounded-full border border-white/40" style={{ backgroundColor: pen.color }} />
              </button>
            );
          })}
          <button
            type="button"
            aria-label="Highlighter"
            aria-pressed={tool === "highlighter"}
            onClick={() => {
              setTool("highlighter");
              setColor(HIGHLIGHTER_COLOR);
            }}
            className={cn(toolButton, tool === "highlighter" ? "bg-white/15 ring-2 ring-white" : "hover:bg-white/10")}
          >
            <Highlighter className="h-5 w-5" style={{ color: HIGHLIGHTER_COLOR }} />
          </button>
          <button
            type="button"
            aria-label="Eraser"
            aria-pressed={tool === "eraser"}
            onClick={() => setTool("eraser")}
            className={cn(toolButton, tool === "eraser" ? "bg-white/15 ring-2 ring-white" : "hover:bg-white/10")}
          >
            <Eraser className="h-5 w-5" />
          </button>
          <span className="mx-1 h-6 w-px shrink-0 bg-white/15" />
          <button type="button" aria-label="Undo" onClick={undo} disabled={!history.length} className={cn(toolButton, "hover:bg-white/10 disabled:opacity-30")}>
            <Undo2 className="h-5 w-5" />
          </button>
          <button type="button" aria-label="Redo" onClick={redo} disabled={!future.length} className={cn(toolButton, "hover:bg-white/10 disabled:opacity-30")}>
            <Redo2 className="h-5 w-5" />
          </button>
          <button
            type="button"
            aria-label="Clear this page"
            title="Clear this page"
            onClick={() => currentKey && strokes.length && change(currentKey, [])}
            disabled={!strokes.length}
            className={cn(toolButton, "hover:bg-white/10 disabled:opacity-30")}
          >
            <Trash2 className="h-5 w-5" />
          </button>
          <span className="mx-1 h-6 w-px shrink-0 bg-white/15" />
          <button
            type="button"
            aria-label="Draw with a finger"
            aria-pressed={fingerDraws}
            title={fingerDraws ? "Fingers draw (tap to make fingers move the page)" : "Fingers move the page (tap to draw with a finger)"}
            onClick={() => setFingerDraws((value) => !value)}
            className={cn("inline-flex h-10 shrink-0 items-center gap-1.5 rounded-md px-2.5 text-xs", fingerDraws ? "bg-white/15 ring-2 ring-white" : "hover:bg-white/10")}
          >
            <Hand className="h-4 w-4" />
            {fingerDraws ? "Finger draws" : "Finger moves"}
          </button>
          <span className="ml-auto flex shrink-0 items-center gap-1">
            <button type="button" aria-label="Zoom out" onClick={() => setView((value) => ({ ...value, zoom: clampZoom(value.zoom - 0.5), ...(value.zoom - 0.5 <= 1 ? { x: 0, y: 0 } : {}) }))} className={cn(toolButton, "hover:bg-white/10")}>
              <Minus className="h-4 w-4" />
            </button>
            <button type="button" onClick={() => setView({ zoom: 1, x: 0, y: 0 })} className="h-10 min-w-12 rounded-md px-2 text-xs tabular-nums hover:bg-white/10" aria-label="Fit the page">
              {Math.round(view.zoom * 100)}%
            </button>
            <button type="button" aria-label="Zoom in" onClick={() => setView((value) => ({ ...value, zoom: clampZoom(value.zoom + 0.5) }))} className={cn(toolButton, "hover:bg-white/10")}>
              <Plus className="h-4 w-4" />
            </button>
          </span>
        </div>
      ) : null}

      {restored && drawing ? (
        <p className="shrink-0 bg-amber-500/15 px-3 py-1.5 text-center text-xs text-amber-200">
          Your review so far is back{restored.at ? ` (saved ${formatWhen(restored.at)})` : ""}. Keep going, then Submit after the last page.
        </p>
      ) : null}

      {/* The page */}
      <div
        ref={stageRef}
        className="relative min-h-0 flex-1 touch-none overflow-hidden"
        onPointerDownCapture={(event) => {
          // The Pencil touched down: whatever else is on the screen is the hand holding it. Stop treating
          // it as a finger moving the page, or the page slides about between letters.
          if (event.pointerType !== "pen" || !drawing) return;
          penAt.current = performance.now();
          touches.current.clear();
          gesture.current = null;
        }}
        onPointerUpCapture={(event) => {
          if (event.pointerType === "pen") penAt.current = performance.now();
        }}
        onPointerDown={(event) => {
          if (event.pointerType !== "touch" || drawingNow.current) return;
          if (drawing && performance.now() - penAt.current < PALM_GRACE) return;
          touches.current.set(event.pointerId, { x: event.clientX, y: event.clientY });
          try {
            event.currentTarget.setPointerCapture(event.pointerId);
          } catch {
            // Capture isn't essential for moving the page.
          }
          startGesture();
        }}
        onPointerMove={(event) => {
          if (!touches.current.has(event.pointerId) || drawingNow.current) return;
          touches.current.set(event.pointerId, { x: event.clientX, y: event.clientY });
          const start = gesture.current;
          if (!start) return;
          const points = [...touches.current.values()];
          if (points.length >= 2 && start.startDistance > 0) {
            const distance = Math.hypot(points[0].x - points[1].x, points[0].y - points[1].y);
            const mid = { x: (points[0].x + points[1].x) / 2, y: (points[0].y + points[1].y) / 2 };
            const zoom = clampZoom((start.startZoom * distance) / start.startDistance);
            const next = { zoom, x: start.startView.x + (mid.x - start.startMid.x), y: start.startView.y + (mid.y - start.startMid.y) };
            viewRef.current = next;
            setView(next);
          } else if (points.length === 1 && viewRef.current.zoom > 1) {
            const next = { ...start.startView, x: start.startView.x + (points[0].x - start.startX), y: start.startView.y + (points[0].y - start.startY) };
            viewRef.current = next;
            setView(next);
          }
        }}
        onPointerUp={(event) => {
          if (!touches.current.has(event.pointerId)) return;
          const start = gesture.current;
          const wasSingle = touches.current.size === 1;
          touches.current.delete(event.pointerId);
          // A sideways swipe with one finger on a page that isn't zoomed turns the page.
          if (wasSingle && start && viewRef.current.zoom <= 1) {
            const dx = event.clientX - start.startX;
            const dy = event.clientY - start.startY;
            if (Math.abs(dx) > 60 && Math.abs(dx) > Math.abs(dy) * 1.5) goTo(index + (dx < 0 ? 1 : -1));
          }
          if (touches.current.size) startGesture();
          else gesture.current = null;
          if (viewRef.current.zoom <= 1.01) {
            viewRef.current = { zoom: 1, x: 0, y: 0 };
            setView(viewRef.current);
          }
        }}
        onPointerCancel={(event) => {
          touches.current.delete(event.pointerId);
          if (!touches.current.size) gesture.current = null;
        }}
        onWheel={(event) => {
          // Trackpad pinch (or Ctrl + scroll) zooms; scrolling moves a zoomed page.
          if (event.ctrlKey) setView((value) => ({ ...value, zoom: clampZoom(value.zoom - event.deltaY * 0.01) }));
          else if (view.zoom > 1) setView((value) => ({ ...value, x: value.x - event.deltaX, y: value.y - event.deltaY }));
        }}
      >
        {loadError ? (
          <p className="absolute inset-0 grid place-items-center px-6 text-center text-sm text-red-300">{loadError}</p>
        ) : loading || !viewLoaded ? (
          <p className="absolute inset-0 flex items-center justify-center gap-2 text-sm text-white/70">
            <Loader2 className="h-4 w-4 animate-spin" />
            Opening the pages…
          </p>
        ) : !current ? (
          <p className="absolute inset-0 grid place-items-center px-6 text-center text-sm text-white/70">
            {drawing ? "This draft has no images or PDF pages to mark up." : "This review has no marks left (the pages may have been removed)."}
          </p>
        ) : (
          <div className="absolute inset-0 flex items-center justify-center">
            <div style={{ transform: `translate(${view.x}px, ${view.y}px) scale(${view.zoom})`, transformOrigin: "center center" }}>
              <MarkupPage
                key={currentKey}
                slide={current}
                width={fit.width}
                height={fit.height}
                strokes={strokes}
                showMarks={showMarks}
                editable={drawing}
                tool={tool}
                color={color}
                fingerDraws={fingerDraws}
                zoom={view.zoom}
                onPenSeen={() => setPenSeen(true)}
                onDrawingChange={(active) => {
                  drawingNow.current = active;
                  if (active && tool === "eraser") erasing.current = { before: pagesRef.current[currentKey] ?? [], removed: false };
                  if (!active && erasing.current) {
                    const { before, removed } = erasing.current;
                    erasing.current = null;
                    if (removed) {
                      setHistory((items) => [...items.slice(-199), { key: currentKey, before }]);
                      setFuture([]);
                      edited();
                    }
                  }
                }}
                onStroke={(stroke) =>
                  change(currentKey, [...(pagesRef.current[currentKey] ?? []), { ...stroke, points: simplifyPoints(stroke.points) }])
                }
                onErase={(x, y) => {
                  const existing = pagesRef.current[currentKey] ?? [];
                  const next = eraseAt(existing, x, y, 0.015, current.height / Math.max(1, current.width));
                  if (next.length === existing.length) return;
                  if (erasing.current) erasing.current.removed = true;
                  setPages({ ...pagesRef.current, [currentKey]: next });
                }}
              />
            </div>
          </div>
        )}
      </div>

      {/* Pages */}
      <div className="flex shrink-0 items-center gap-2 border-t border-white/10 px-2 py-2 pb-[max(0.5rem,env(safe-area-inset-bottom))]">
        <button type="button" aria-label="Previous page" onClick={() => goTo(index - 1)} disabled={index <= 0} className={cn(toolButton, "hover:bg-white/10 disabled:opacity-30")}>
          <ChevronLeft className="h-5 w-5" />
        </button>
        <div className="flex min-w-0 flex-1 gap-1.5 overflow-x-auto py-0.5 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden" aria-label="Pages">
          {slides.map((slide, position) => {
            const key = slideKey(slide);
            const marked = (pages[key] ?? []).length > 0;
            const number = drawing ? position + 1 : allSlides.indexOf(slide) + 1;
            return (
              <button
                key={key}
                type="button"
                onClick={() => goTo(position)}
                aria-current={position === index}
                aria-label={`Page ${number}${marked ? ", marked" : ""}`}
                className={cn(
                  "relative h-9 min-w-9 shrink-0 rounded-md px-2 text-xs tabular-nums transition-colors",
                  position === index ? "bg-white text-neutral-900" : "bg-white/10 hover:bg-white/20",
                )}
              >
                {number}
                {marked ? <span className="absolute right-0.5 top-0.5 h-2 w-2 rounded-full bg-red-500" aria-hidden="true" /> : null}
              </button>
            );
          })}
        </div>
        {drawing && slides.length > 0 && index >= slides.length - 1 ? (
          // The end of the post or carousel: the only place to send the review, once every page is seen.
          <button
            type="button"
            onClick={() => setConfirming(true)}
            disabled={markedPositions.length === 0 || !viewLoaded}
            title={markedPositions.length === 0 ? "Draw on a page first" : undefined}
            className="inline-flex h-10 shrink-0 items-center gap-2 rounded-md bg-primary px-3 text-sm font-semibold text-primary-foreground transition-opacity disabled:opacity-40 sm:px-4"
          >
            <Send className="h-4 w-4" />
            Submit review{markedPositions.length ? ` (${markedPositions.length})` : ""}
          </button>
        ) : (
          <button
            type="button"
            aria-label="Next page"
            onClick={() => goTo(index + 1)}
            disabled={index >= slides.length - 1}
            className={cn(drawing ? "inline-flex h-10 shrink-0 items-center gap-1 rounded-md px-2.5 text-sm" : toolButton, "hover:bg-white/10 disabled:opacity-30")}
          >
            {drawing ? <span className="hidden text-xs text-white/70 sm:inline">Next</span> : null}
            <ChevronRight className="h-5 w-5" />
          </button>
        )}
      </div>

      {/* Submit */}
      {confirming && drawing ? (
        <div className="absolute inset-0 z-10 flex items-end justify-center bg-black/60 sm:items-center" onClick={(event) => event.target === event.currentTarget && !submitting && setConfirming(false)}>
          <div className="w-full max-w-md rounded-t-lg border border-white/10 bg-neutral-800 p-4 pb-[max(1rem,env(safe-area-inset-bottom))] sm:rounded-lg">
            <h2 className="text-base font-semibold">Submit your review</h2>
            <p className="mt-1 text-sm text-white/70">
              Your marks on {describePages(markedPositions)} of {draftLabel} go to the team, with a review comment. Until
              you submit, only you can see them.
            </p>
            <label className="mt-3 block text-xs text-white/70">
              Note for the team (optional)
              <textarea
                value={note}
                onChange={(event) => setNote(event.target.value)}
                onBlur={() => dirty.current && void saveNow()}
                rows={3}
                maxLength={3000}
                placeholder="Anything to add to your marks…"
                className="mt-1 w-full rounded-md border border-white/15 bg-neutral-900 px-3 py-2 text-base text-white placeholder:text-white/40 focus:outline-none focus:ring-2 focus:ring-primary sm:text-sm"
              />
            </label>
            {submitError ? (
              <p role="alert" className="mt-2 text-sm text-red-300">
                {submitError}
              </p>
            ) : null}
            <div className="mt-4 flex justify-end gap-2">
              <button type="button" onClick={() => setConfirming(false)} disabled={submitting} className="h-10 rounded-md px-4 text-sm hover:bg-white/10">
                Keep drawing
              </button>
              <button
                type="button"
                onClick={() => void submit()}
                disabled={submitting}
                className="inline-flex h-10 items-center gap-2 rounded-md bg-primary px-4 text-sm font-semibold text-primary-foreground disabled:opacity-60"
              >
                {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                {submitting ? "Submitting…" : "Submit review"}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
