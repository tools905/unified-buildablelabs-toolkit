"use client";

import { useEffect, useRef, useState } from "react";
import { ChevronLeft, ChevronRight, Loader2 } from "lucide-react";
import type { PDFDocumentLoadingTask, PDFDocumentProxy, RenderTask } from "pdfjs-dist";
import { Button } from "@/components/ui/button";

// Show one PDF page at a time, like flipping through a carousel. Give it a `key`
// of the URL so switching files starts fresh. With `pages` (the PDF's page pictures) those are shown
// instead: only the page on screen and the next one are downloaded, and nothing has to be drawn, which
// is far quicker on a phone than reading the whole PDF.
export function PdfViewer({ url, pages }: { url: string; pages?: { url: string; width: number; height: number }[] }) {
  if (pages?.length) return <PagePictures pages={pages} />;
  return <PdfCanvasViewer url={url} />;
}

function PagePictures({ pages }: { pages: { url: string; width: number; height: number }[] }) {
  const [page, setPage] = useState(1);
  const [loaded, setLoaded] = useState<Set<number>>(() => new Set());
  const current = pages[page - 1];
  return (
    <div className="flex h-full flex-col">
      <div className="relative flex min-h-0 flex-1 items-center justify-center overflow-hidden">
        {loaded.has(page) ? null : (
          <div className="absolute inset-0 flex items-center justify-center text-muted-foreground">
            <Loader2 className="h-5 w-5 animate-spin" />
          </div>
        )}
        {/* eslint-disable-next-line @next/next/no-img-element -- signed Supabase URLs, not a fixed host */}
        <img
          key={current.url}
          src={current.url}
          alt={`PDF page ${page}`}
          width={current.width}
          height={current.height}
          onLoad={() => setLoaded((value) => new Set(value).add(page))}
          className="block h-full w-full object-contain"
        />
        {/* The next page loads in the background, so turning to it is instant. */}
        {pages[page] ? (
          // eslint-disable-next-line @next/next/no-img-element -- signed Supabase URLs, not a fixed host
          <img src={pages[page].url} alt="" aria-hidden="true" className="hidden" onLoad={() => setLoaded((value) => new Set(value).add(page + 1))} />
        ) : null}
      </div>
      <div className="flex shrink-0 items-center justify-between border-t border-border bg-card px-2 py-1.5 text-xs text-muted-foreground">
        <Button type="button" variant="ghost" size="sm" aria-label="Previous page" disabled={page <= 1} onClick={() => setPage((value) => value - 1)}>
          <ChevronLeft className="h-4 w-4" />
        </Button>
        <span>
          Page {page} of {pages.length}
        </span>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          aria-label="Next page"
          disabled={page >= pages.length}
          onClick={() => setPage((value) => value + 1)}
        >
          <ChevronRight className="h-4 w-4" />
        </Button>
      </div>
    </div>
  );
}

function PdfCanvasViewer({ url }: { url: string }) {
  const wrapperRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [doc, setDoc] = useState<PDFDocumentProxy | null>(null);
  const [page, setPage] = useState(1);
  const [failed, setFailed] = useState(false);
  const [box, setBox] = useState({ width: 0, height: 0 });

  useEffect(() => {
    const wrapper = wrapperRef.current;
    if (!wrapper) return;
    const observer = new ResizeObserver(() => setBox({ width: wrapper.clientWidth, height: wrapper.clientHeight }));
    observer.observe(wrapper);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    let cancelled = false;
    let task: PDFDocumentLoadingTask | null = null;
    (async () => {
      try {
        const pdfjs = await import("pdfjs-dist");
        pdfjs.GlobalWorkerOptions.workerSrc = new URL("pdfjs-dist/build/pdf.worker.min.mjs", import.meta.url).toString();
        task = pdfjs.getDocument({ url });
        const loaded = await task.promise;
        if (cancelled) return;
        setDoc(loaded);
      } catch {
        if (!cancelled) setFailed(true);
      }
    })();
    return () => {
      cancelled = true;
      void task?.destroy();
    };
  }, [url]);

  useEffect(() => {
    if (!doc || box.width === 0 || box.height === 0) return;
    let cancelled = false;
    let task: RenderTask | null = null;
    (async () => {
      const pdfPage = await doc.getPage(page);
      const canvas = canvasRef.current;
      if (cancelled || !canvas) return;
      const ratio = window.devicePixelRatio || 1;
      const base = pdfPage.getViewport({ scale: 1 });
      // Fit the whole page inside the box so nothing needs scrolling.
      const fit = Math.min(box.width / base.width, box.height / base.height);
      const viewport = pdfPage.getViewport({ scale: fit * ratio });
      canvas.width = viewport.width;
      canvas.height = viewport.height;
      canvas.style.width = `${viewport.width / ratio}px`;
      canvas.style.height = `${viewport.height / ratio}px`;
      task = pdfPage.render({ canvas, viewport });
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
  }, [doc, page, box.width, box.height]);

  if (failed) {
    return <p className="p-6 text-center text-sm text-muted-foreground">Couldn&apos;t load this PDF.</p>;
  }

  return (
    <div className="flex h-full flex-col">
      <div ref={wrapperRef} className="relative flex min-h-0 flex-1 items-center justify-center overflow-hidden">
        {doc ? null : (
          <div className="absolute inset-0 flex items-center justify-center text-muted-foreground">
            <Loader2 className="h-5 w-5 animate-spin" />
          </div>
        )}
        <canvas ref={canvasRef} className="block" aria-label={`PDF page ${page}`} />
      </div>
      <div className="flex shrink-0 items-center justify-between border-t border-border bg-card px-2 py-1.5 text-xs text-muted-foreground">
        <Button
          type="button"
          variant="ghost"
          size="sm"
          aria-label="Previous page"
          disabled={!doc || page <= 1}
          onClick={() => setPage((value) => value - 1)}
        >
          <ChevronLeft className="h-4 w-4" />
        </Button>
        <span>{doc ? `Page ${page} of ${doc.numPages}` : "Loading…"}</span>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          aria-label="Next page"
          disabled={!doc || page >= doc.numPages}
          onClick={() => setPage((value) => value + 1)}
        >
          <ChevronRight className="h-4 w-4" />
        </Button>
      </div>
    </div>
  );
}
