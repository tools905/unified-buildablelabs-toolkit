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

type Pages = Record<string, MarkupStroke[]>;

// Where a slide came from: the uploaded file and, for a PDF, which page.
function slidePlace(slide: LoadedSlide) {
  return {
    attachmentId: slide.pdf ? slide.id.split(":p")[0] : slide.id,
    pageNumber: slide.pdf?.pageNumber ?? 1,
  };
}
const slideKey = (slide: LoadedSlide) => {
  const place = slidePlace(slide);
  return markupPageKey(place.attachmentId, place.pageNumber);
};

const storageKey = (ideaId: string, fileIds: string[]) => `tc-markup:${ideaId}:${fileIds.join(",")}`;

function readSaved(key: string): Pages {
  try {
    const raw = window.localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as Pages) : {};
  } catch {
    return {};
  }
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
        onClose: () => void;
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
  const [pages, setPagesState] = useState<Pages>(() => (drawing ? readSaved(saveKey) : {}));
  // The marks as they are right now, also between screen updates: a quick Pencil sweep can erase, lift
  // and undo before React has drawn the screen again, and every step must see the latest marks.
  const pagesRef = useRef(pages);
  const setPages = useCallback((next: Pages) => {
    pagesRef.current = next;
    setPagesState(next);
  }, []);
  const [history, setHistory] = useState<{ key: string; before: MarkupStroke[] }[]>([]);
  const [future, setFuture] = useState<{ key: string; before: MarkupStroke[] }[]>([]);
  const [restored] = useState(() => drawing && Object.values(readSaved(saveKey)).some((strokes) => strokes.length > 0));
  const [loadError, setLoadError] = useState<string | null>(null);
  // Drawing needs nothing more; looking at a review waits for its marks to load.
  const [viewLoaded, setViewLoaded] = useState(drawing);

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

  // Unsent marks stay on this device until they are submitted, so a reload or a dropped connection
  // doesn't lose them.
  useEffect(() => {
    if (!drawing) return;
    try {
      const marked = Object.fromEntries(Object.entries(pages).filter(([, strokes]) => strokes.length > 0));
      if (Object.keys(marked).length) window.localStorage.setItem(saveKey, JSON.stringify(marked));
      else window.localStorage.removeItem(saveKey);
    } catch {
      // Storage can be unavailable (private browsing); the marks are just not kept then.
    }
  }, [drawing, pages, saveKey]);

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
  }

  function undo() {
    const last = history[history.length - 1];
    if (!last) return;
    // Read the page now: the updaters below run later, after the marks have changed.
    const current = pagesRef.current[last.key] ?? [];
    setHistory((items) => items.slice(0, -1));
    setFuture((items) => [...items, { key: last.key, before: current }]);
    setPages({ ...pagesRef.current, [last.key]: last.before });
  }

  function redo() {
    const next = future[future.length - 1];
    if (!next) return;
    const current = pagesRef.current[next.key] ?? [];
    setFuture((items) => items.slice(0, -1));
    setHistory((items) => [...items, { key: next.key, before: current }]);
    setPages({ ...pagesRef.current, [next.key]: next.before });
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
      if (event.key === "Escape") onClose();
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
  const [note, setNote] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  async function submit() {
    if (props.mode !== "draw") return;
    setSubmitting(true);
    setSubmitError(null);
    const marked = allSlides
      .map((slide, position) => ({ slide, position: position + 1, strokes: pages[slideKey(slide)] ?? [] }))
      .filter((page) => page.strokes.length > 0)
      .map(({ slide, position, strokes }) => ({ ...slidePlace(slide), position, strokes }));
    try {
      const response = await fetch(`${BASE_PATH}/api/content-board/ideas/${encodeURIComponent(ideaId)}/reviews`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ fileIds, note: note.trim() || undefined, pages: marked }),
      });
      const result = (await response.json().catch(() => ({}))) as { error?: string };
      if (!response.ok) throw new Error(result.error ?? "Couldn't save the review. Please try again.");
      try {
        window.localStorage.removeItem(saveKey);
      } catch {
        // Nothing to clean up.
      }
      props.onSubmitted();
    } catch (error) {
      setSubmitError(error instanceof Error ? error.message : "Couldn't save the review. Please try again.");
      setSubmitting(false);
    }
  }

  function requestClose() {
    // Unsent marks are kept on this device, so closing loses nothing; just say so.
    onClose();
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
              ? penSeen
                ? "Draw with the Pencil. Fingers move and zoom the page."
                : "Draw with the Apple Pencil or a mouse. Fingers move and zoom the page; two fingers pinch to zoom."
              : `${draftLabel} · marks on ${describePages(markedPositions)}`}
          </p>
        </div>
        {slides.length ? (
          <span className="hidden shrink-0 text-xs text-white/70 sm:inline">
            Page {Math.min(index, slides.length - 1) + 1} of {slides.length}
          </span>
        ) : null}
        {drawing ? (
          <button
            type="button"
            onClick={() => setConfirming(true)}
            disabled={markedPositions.length === 0}
            className="inline-flex h-10 shrink-0 items-center gap-2 rounded-md bg-primary px-3 text-sm font-semibold text-primary-foreground transition-opacity disabled:opacity-40 sm:px-4"
          >
            <Send className="h-4 w-4" />
            Submit{markedPositions.length ? ` (${markedPositions.length})` : ""}
          </button>
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
          Your unsent marks from last time are back. Keep going, or clear pages you don&apos;t need.
        </p>
      ) : null}

      {/* The page */}
      <div
        ref={stageRef}
        className="relative min-h-0 flex-1 touch-none overflow-hidden"
        onPointerDown={(event) => {
          if (event.pointerType !== "touch" || drawingNow.current) return;
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
        <button type="button" aria-label="Next page" onClick={() => goTo(index + 1)} disabled={index >= slides.length - 1} className={cn(toolButton, "hover:bg-white/10 disabled:opacity-30")}>
          <ChevronRight className="h-5 w-5" />
        </button>
      </div>

      {/* Submit */}
      {confirming && drawing ? (
        <div className="absolute inset-0 z-10 flex items-end justify-center bg-black/60 sm:items-center" onClick={(event) => event.target === event.currentTarget && !submitting && setConfirming(false)}>
          <div className="w-full max-w-md rounded-t-lg border border-white/10 bg-neutral-800 p-4 pb-[max(1rem,env(safe-area-inset-bottom))] sm:rounded-lg">
            <h2 className="text-base font-semibold">Submit your review</h2>
            <p className="mt-1 text-sm text-white/70">
              Your marks on {describePages(markedPositions)} of {draftLabel} go to the team, with a review comment.
            </p>
            <label className="mt-3 block text-xs text-white/70">
              Note for the team (optional)
              <textarea
                value={note}
                onChange={(event) => setNote(event.target.value)}
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
