"use client";

import { useEffect, useRef, useState } from "react";
import type { RenderTask } from "pdfjs-dist";
import type { LoadedSlide } from "@/components/content-board/post-preview/use-post-slides";

// One slide, filling its frame the way a feed does: the picture covers the frame and whatever sticks
// out is cut off, which is exactly the crop the platform would apply. PDF pages are drawn only while
// they are near the one being looked at.
export function SlideView({ slide, near }: { slide: LoadedSlide; near: boolean }) {
  const boxRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [box, setBox] = useState({ width: 0, height: 0 });
  const pdf = slide.pdf;

  useEffect(() => {
    const element = boxRef.current;
    if (!element) return;
    const observer = new ResizeObserver(() => setBox({ width: element.clientWidth, height: element.clientHeight }));
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    if (!pdf || !near || box.width === 0 || box.height === 0) return;
    let cancelled = false;
    let task: RenderTask | null = null;
    (async () => {
      const page = await pdf.doc.getPage(pdf.pageNumber);
      const canvas = canvasRef.current;
      if (cancelled || !canvas) return;
      const ratio = window.devicePixelRatio || 1;
      const base = page.getViewport({ scale: 1 });
      // Cover the frame: scale until both sides are at least as big as the frame.
      const cover = Math.max(box.width / base.width, box.height / base.height);
      const viewport = page.getViewport({ scale: cover * ratio });
      canvas.width = viewport.width;
      canvas.height = viewport.height;
      canvas.style.width = `${viewport.width / ratio}px`;
      canvas.style.height = `${viewport.height / ratio}px`;
      task = page.render({ canvas, viewport });
      try {
        await task.promise;
      } catch {
        /* a newer render replaced this one */
      }
    })();
    return () => {
      cancelled = true;
      task?.cancel();
    };
  }, [pdf, near, box.width, box.height]);

  return (
    <div ref={boxRef} className="relative h-full w-full overflow-hidden bg-neutral-200">
      {slide.url ? (
        // eslint-disable-next-line @next/next/no-img-element -- signed Supabase URLs, not a fixed host
        <img
          src={slide.url}
          alt={slide.label}
          draggable={false}
          // Pages far from the one on screen load when they come close.
          loading={near ? "eager" : "lazy"}
          decoding="async"
          className="h-full w-full select-none object-cover"
        />
      ) : null}
      {pdf ? (
        <canvas
          ref={canvasRef}
          aria-label={slide.label}
          className="absolute left-1/2 top-1/2 block -translate-x-1/2 -translate-y-1/2"
        />
      ) : null}
    </div>
  );
}
