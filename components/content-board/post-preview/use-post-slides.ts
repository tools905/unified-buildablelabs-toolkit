"use client";

import { useEffect, useRef, useState } from "react";
import type { PDFDocumentProxy } from "pdfjs-dist";
import type { PanelAttachment } from "@/components/content-board/types";
import type { PreviewSlide } from "@/lib/utils/social-preview";

// A slide plus what is needed to draw it: an image address, or a page of an open PDF.
export type LoadedSlide = PreviewSlide & {
  url?: string;
  pdf?: { doc: PDFDocumentProxy; pageNumber: number };
};

// Pages beyond this are left out of the preview (the viewer still shows the whole PDF).
export const MAX_PREVIEW_PAGES = 30;

type Result = { key: string; slides: LoadedSlide[]; skippedLinks: number; failed: number; cutPages: boolean };

function loadImage(url: string): Promise<{ width: number; height: number }> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve({ width: image.naturalWidth, height: image.naturalHeight });
    image.onerror = () => reject(new Error("Could not load the image."));
    image.src = url;
  });
}

// Turns the idea's uploaded files into the slides of a post, in upload order: an image is one slide,
// a PDF is one slide per page. Design links are counted but can't be shown.
export function usePostSlides(attachments: PanelAttachment[]) {
  const usable = attachments.filter((item) => item.kind !== "link" && item.url);
  const key = usable.map((item) => `${item.id}:${item.fileName ?? ""}`).join("|");
  const [result, setResult] = useState<Result | null>(null);
  // The signed addresses change every time the panel reloads, so the latest ones are read from here
  // when a load starts, while the load itself only restarts when the set of files changes.
  const latest = useRef(attachments);
  useEffect(() => {
    latest.current = attachments;
  });

  useEffect(() => {
    let cancelled = false;
    const tasks: { destroy: () => Promise<void> }[] = [];

    (async () => {
      const files = latest.current.filter((item) => item.kind !== "link" && item.url);
      const skippedLinks = latest.current.filter((item) => item.kind === "link").length;
      const slides: LoadedSlide[] = [];
      let failed = 0;
      let cutPages = false;

      for (const file of files) {
        try {
          if (file.kind === "image" && file.url) {
            const { width, height } = await loadImage(file.url);
            slides.push({ id: file.id, source: "image", width, height, label: file.fileName ?? "Image", url: file.url });
          } else if (file.kind === "pdf" && file.url) {
            const pdfjs = await import("pdfjs-dist");
            pdfjs.GlobalWorkerOptions.workerSrc = new URL("pdfjs-dist/build/pdf.worker.min.mjs", import.meta.url).toString();
            const task = pdfjs.getDocument({ url: file.url });
            tasks.push(task);
            const doc = await task.promise;
            const pages = Math.min(doc.numPages, MAX_PREVIEW_PAGES);
            if (doc.numPages > MAX_PREVIEW_PAGES) cutPages = true;
            for (let number = 1; number <= pages; number += 1) {
              const page = await doc.getPage(number);
              const view = page.getViewport({ scale: 1 });
              slides.push({
                id: `${file.id}:p${number}`,
                source: "pdf",
                width: Math.round(view.width),
                height: Math.round(view.height),
                label: `${file.fileName ?? "PDF"} · page ${number}`,
                pdf: { doc, pageNumber: number },
              });
            }
          }
        } catch {
          failed += 1;
        }
        if (cancelled) return;
      }
      if (!cancelled) setResult({ key, slides, skippedLinks, failed, cutPages });
    })();

    return () => {
      cancelled = true;
      tasks.forEach((task) => void task.destroy().catch(() => {}));
    };
  }, [key]);

  const ready = result !== null && result.key === key;
  return {
    loading: !ready,
    slides: ready ? result.slides : [],
    skippedLinks: ready ? result.skippedLinks : 0,
    failed: ready ? result.failed : 0,
    cutPages: ready ? result.cutPages : false,
  };
}
