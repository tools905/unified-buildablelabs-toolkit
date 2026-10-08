"use client";

import { useEffect, useRef } from "react";
import type { RenderTask } from "pdfjs-dist";
import type { LoadedSlide } from "@/components/content-board/post-preview/use-post-slides";
import { HIGHLIGHTER_OPACITY, strokePath, strokeWidth, type MarkupStroke, type MarkupTool } from "@/lib/utils/markup";

export type MarkupInput = MarkupTool | "eraser";

// Units across the overlay's drawing area; down is scaled to the page's shape.
const VIEW_WIDTH = 1000;

// One page of a draft with the review marks on top. When `editable`, the Apple Pencil (or a mouse) draws
// on it; fingers are left alone so they can move and zoom the page, unless `fingerDraws` is on. A palm
// resting on the screen while the Pencil is down is ignored.
export function MarkupPage({
  slide,
  width,
  height,
  strokes,
  showMarks,
  editable,
  tool,
  color,
  fingerDraws,
  onStroke,
  onErase,
  onDrawingChange,
  onPenSeen,
}: {
  slide: LoadedSlide;
  // The size the page is shown at, in CSS pixels.
  width: number;
  height: number;
  strokes: MarkupStroke[];
  showMarks: boolean;
  editable: boolean;
  tool: MarkupInput;
  color: string;
  fingerDraws: boolean;
  onStroke: (stroke: MarkupStroke) => void;
  // Called for every point the eraser passes over (x and y between 0 and 1).
  onErase: (x: number, y: number) => void;
  // True while a line is being drawn, so the screen doesn't treat a resting palm as a pan.
  onDrawingChange: (drawing: boolean) => void;
  onPenSeen: () => void;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const surfaceRef = useRef<HTMLDivElement>(null);
  const livePathRef = useRef<SVGPathElement>(null);
  const live = useRef<{ pointerId: number; points: number[]; pressures: number[] } | null>(null);
  const viewHeight = (VIEW_WIDTH * slide.height) / Math.max(1, slide.width);
  const pdf = slide.pdf;

  // PDF pages are drawn sharper than the screen needs, so they stay crisp when zoomed in to mark details.
  useEffect(() => {
    if (!pdf || width <= 0 || height <= 0) return;
    let cancelled = false;
    let task: RenderTask | null = null;
    (async () => {
      const page = await pdf.doc.getPage(pdf.pageNumber);
      const canvas = canvasRef.current;
      if (cancelled || !canvas) return;
      const base = page.getViewport({ scale: 1 });
      // Sharp enough to zoom in on, but within what iPad Safari will draw (it shows nothing for a
      // canvas over about 16.7 million pixels), and quick to draw: at most about 8 million.
      const density = Math.min((window.devicePixelRatio || 1) * 1.75, Math.sqrt(8_000_000 / Math.max(1, width * height)), 4096 / width);
      const viewport = page.getViewport({ scale: (width / base.width) * density });
      canvas.width = Math.round(viewport.width);
      canvas.height = Math.round(viewport.height);
      task = page.render({ canvas, viewport });
      try {
        await task.promise;
      } catch {
        // A newer render replaced this one.
      }
    })();
    return () => {
      cancelled = true;
      task?.cancel();
    };
  }, [pdf, width, height]);

  function pointFrom(event: { clientX: number; clientY: number }) {
    const rect = surfaceRef.current?.getBoundingClientRect();
    if (!rect || rect.width === 0 || rect.height === 0) return null;
    return { x: (event.clientX - rect.left) / rect.width, y: (event.clientY - rect.top) / rect.height };
  }

  function addPoint(event: PointerEvent) {
    const current = live.current;
    const point = pointFrom(event);
    if (!current || !point) return;
    if (tool === "eraser") {
      onErase(point.x, point.y);
      return;
    }
    current.points.push(point.x, point.y);
    if (event.pointerType === "pen") current.pressures.push(event.pressure);
    livePathRef.current?.setAttribute("d", strokePath(current.points, VIEW_WIDTH, viewHeight));
  }

  function finish() {
    const current = live.current;
    live.current = null;
    onDrawingChange(false);
    livePathRef.current?.setAttribute("d", "");
    if (!current || tool === "eraser" || current.points.length < 2) return;
    const pressure = current.pressures.length
      ? current.pressures.reduce((total, value) => total + value, 0) / current.pressures.length
      : 0.5;
    onStroke({ tool, color, width: strokeWidth(tool, pressure), points: current.points });
  }

  const liveWidth = strokeWidth(tool === "eraser" ? "pen" : tool, 0.5) * VIEW_WIDTH;

  return (
    <div
      ref={surfaceRef}
      className="relative overflow-hidden bg-white shadow-2xl [-webkit-touch-callout:none]"
      style={{ width, height, touchAction: editable ? "none" : undefined, cursor: editable ? (tool === "eraser" ? "cell" : "crosshair") : undefined }}
      onPointerDown={(event) => {
        if (!editable) return;
        if (event.pointerType === "touch" && !fingerDraws) return;
        if (event.pointerType === "mouse" && event.button !== 0) return;
        if (event.pointerType === "pen") onPenSeen();
        event.stopPropagation();
        event.preventDefault();
        try {
          // Keeps the line going when the Pencil slides off the page's edge.
          event.currentTarget.setPointerCapture(event.pointerId);
        } catch {
          // Some browsers refuse capture for a pointer they've already released; drawing still works.
        }
        live.current = { pointerId: event.pointerId, points: [], pressures: [] };
        onDrawingChange(true);
        addPoint(event.nativeEvent);
      }}
      onPointerMove={(event) => {
        if (!live.current || event.pointerId !== live.current.pointerId) return;
        event.stopPropagation();
        // The Pencil reports far more points than the screen draws; use them all for smooth lines.
        const native = event.nativeEvent;
        const all = typeof native.getCoalescedEvents === "function" ? native.getCoalescedEvents() : [];
        (all.length ? all : [native]).forEach(addPoint);
      }}
      onPointerUp={(event) => {
        if (live.current?.pointerId === event.pointerId) finish();
      }}
      onPointerCancel={(event) => {
        if (live.current?.pointerId === event.pointerId) finish();
      }}
    >
      {slide.url ? (
        // eslint-disable-next-line @next/next/no-img-element -- signed Supabase URLs, not a fixed host
        <img src={slide.url} alt={slide.label} draggable={false} className="pointer-events-none h-full w-full select-none object-fill" />
      ) : null}
      {pdf ? <canvas ref={canvasRef} aria-label={slide.label} className="pointer-events-none block h-full w-full" /> : null}
      <svg
        viewBox={`0 0 ${VIEW_WIDTH} ${viewHeight}`}
        preserveAspectRatio="none"
        className="pointer-events-none absolute inset-0 h-full w-full"
        aria-hidden="true"
      >
        {showMarks
          ? strokes.map((stroke, index) => (
              <path
                key={index}
                d={strokePath(stroke.points, VIEW_WIDTH, viewHeight)}
                fill="none"
                stroke={stroke.color}
                strokeWidth={stroke.width * VIEW_WIDTH}
                strokeLinecap="round"
                strokeLinejoin="round"
                // Plain see-through colour, no blending: most carousels are dark, and a "multiply"
                // highlighter disappears on a dark page.
                strokeOpacity={stroke.tool === "highlighter" ? HIGHLIGHTER_OPACITY : 1}
              />
            ))
          : null}
        <path
          ref={livePathRef}
          fill="none"
          stroke={color}
          strokeWidth={liveWidth}
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeOpacity={tool === "highlighter" ? HIGHLIGHTER_OPACITY : 1}
        />
      </svg>
    </div>
  );
}
