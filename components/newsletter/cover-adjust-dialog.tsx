"use client";

import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { CoverCardPreview } from "@/components/newsletter/cover-image-field";
import { cn } from "@/lib/utils/cn";
import { coverTreatment, DEFAULT_COVER_ADJUST, type CoverAdjust, type CoverFade } from "@/lib/utils/newsletter-cover";

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

const FADES: { value: CoverFade; label: string }[] = [
  { value: "lighter", label: "Lighter" },
  { value: null, label: "Auto" },
  { value: "darker", label: "Darker" },
];

// A window for framing the preview image: drag it to move, zoom in, and choose how strong
// the dark fade under the headline is. Two live previews show the story card and the wide
// banner on the article page. Nothing is cut; the original image stays as it is.
export function CoverAdjustDialog({
  url,
  brightness,
  tag,
  title,
  initial,
  onApply,
  onCancel,
}: {
  url: string;
  brightness: number | null;
  tag: string;
  title: string;
  initial: CoverAdjust;
  onApply: (adjust: CoverAdjust) => void;
  onCancel: () => void;
}) {
  const [adjust, setAdjust] = useState<CoverAdjust>(initial);
  const [natural, setNatural] = useState<{ width: number; height: number } | null>(null);
  const frame = useRef<HTMLDivElement>(null);
  const drag = useRef<{ x: number; y: number } | null>(null);

  useEffect(() => {
    const image = new window.Image();
    image.onload = () => setNatural({ width: image.naturalWidth, height: image.naturalHeight });
    image.src = url;
  }, [url]);

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") onCancel();
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [onCancel]);

  // How far the picture can slide inside the frame at the current zoom, in pixels.
  function range(frameWidth: number, frameHeight: number) {
    const ratio = natural ? natural.width / natural.height : 16 / 9;
    const overflowX = Math.max(0, frameHeight * ratio - frameWidth);
    const overflowY = Math.max(0, frameWidth / ratio - frameHeight);
    return {
      x: overflowX * adjust.zoom + frameWidth * (adjust.zoom - 1),
      y: overflowY * adjust.zoom + frameHeight * (adjust.zoom - 1),
    };
  }

  function moveBy(dx: number, dy: number) {
    const box = frame.current?.getBoundingClientRect();
    if (!box) return;
    const available = range(box.width, box.height);
    setAdjust((current) => ({
      ...current,
      focusX: available.x > 1 ? clamp(current.focusX - (dx / available.x) * 100, 0, 100) : current.focusX,
      focusY: available.y > 1 ? clamp(current.focusY - (dy / available.y) * 100, 0, 100) : current.focusY,
    }));
  }

  const treatment = coverTreatment(brightness, adjust.fade);
  const auto = coverTreatment(brightness, null);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
      role="dialog"
      aria-modal="true"
      aria-label="Adjust the preview image"
    >
      <div className="popover-shadow flex max-h-[92vh] w-full max-w-3xl flex-col overflow-hidden border border-border bg-card">
        <div className="flex items-center justify-between border-b border-border px-6 py-4">
          <div>
            <h2 className="text-base font-semibold">Adjust the preview image</h2>
            <p className="text-xs text-muted-foreground">Drag the picture to move it. The original is never cut.</p>
          </div>
          <Button type="button" variant="ghost" size="sm" onClick={onCancel}>
            Cancel
          </Button>
        </div>

        <div className="grid flex-1 gap-6 overflow-y-auto p-6 md:grid-cols-[minmax(0,1fr)_260px]">
          <div>
            <p className="mb-2 text-xs font-medium text-muted-foreground">Story card (drag to move)</p>
            <div
              ref={frame}
              role="slider"
              tabIndex={0}
              aria-label="Position of the picture. Use the arrow keys to move it."
              aria-valuetext={`${Math.round(adjust.focusX)}% across, ${Math.round(adjust.focusY)}% down`}
              aria-valuenow={Math.round(adjust.focusX)}
              aria-valuemin={0}
              aria-valuemax={100}
              className="relative mx-auto aspect-[350/380] w-full max-w-[420px] cursor-grab touch-none select-none outline-none ring-offset-2 focus-visible:ring-2 focus-visible:ring-primary active:cursor-grabbing"
              onPointerDown={(event) => {
                try {
                  event.currentTarget.setPointerCapture(event.pointerId);
                } catch {
                  // Dragging still works without capture, it just stops at the frame's edge.
                }
                drag.current = { x: event.clientX, y: event.clientY };
              }}
              onPointerMove={(event) => {
                if (!drag.current) return;
                moveBy(event.clientX - drag.current.x, event.clientY - drag.current.y);
                drag.current = { x: event.clientX, y: event.clientY };
              }}
              onPointerUp={() => {
                drag.current = null;
              }}
              onPointerCancel={() => {
                drag.current = null;
              }}
              onKeyDown={(event) => {
                const step = 40;
                if (event.key === "ArrowLeft") moveBy(step, 0);
                else if (event.key === "ArrowRight") moveBy(-step, 0);
                else if (event.key === "ArrowUp") moveBy(0, step);
                else if (event.key === "ArrowDown") moveBy(0, -step);
                else return;
                event.preventDefault();
              }}
            >
              <CoverCardPreview url={url} brightness={brightness} adjust={adjust} tag={tag} title={title} aspect="card" />
            </div>
          </div>

          <div className="space-y-5">
            <div>
              <p className="mb-2 text-xs font-medium text-muted-foreground">Article banner</p>
              <CoverCardPreview url={url} brightness={brightness} adjust={adjust} tag="" title="" aspect="banner" />
            </div>

            <div>
              <div className="mb-1 flex items-center justify-between">
                <label htmlFor="cover-zoom" className="text-xs font-medium text-muted-foreground">
                  Zoom
                </label>
                <span className="font-mono text-xs">{adjust.zoom.toFixed(2)}×</span>
              </div>
              <input
                id="cover-zoom"
                type="range"
                min={1}
                max={3}
                step={0.05}
                value={adjust.zoom}
                onChange={(event) => setAdjust((current) => ({ ...current, zoom: Number(event.target.value) }))}
                className="w-full accent-primary"
              />
            </div>

            <div>
              <p className="mb-1 text-xs font-medium text-muted-foreground">Dark fade under the headline</p>
              <div className="grid grid-cols-3 border border-border" role="radiogroup" aria-label="Dark fade">
                {FADES.map((fade) => (
                  <button
                    key={fade.label}
                    type="button"
                    role="radio"
                    aria-checked={adjust.fade === fade.value}
                    onClick={() => setAdjust((current) => ({ ...current, fade: fade.value }))}
                    className={cn(
                      "px-2 py-1.5 text-xs transition-colors",
                      adjust.fade === fade.value ? "bg-primary text-primary-foreground" : "hover:bg-muted",
                    )}
                  >
                    {fade.label}
                  </button>
                ))}
              </div>
              <p className="mt-1 text-xs text-muted-foreground">
                Auto reads how bright the picture is and fades it {Math.round(auto.overlayOpacity * 100)}%.
                {adjust.fade ? ` You chose ${adjust.fade}: ${Math.round(treatment.overlayOpacity * 100)}%.` : ""}
              </p>
            </div>

            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setAdjust((current) => ({ ...DEFAULT_COVER_ADJUST, fade: current.fade }))}
            >
              Center and reset zoom
            </Button>
          </div>
        </div>

        <div className="flex justify-end gap-2 border-t border-border px-6 py-4">
          <Button type="button" variant="outline" onClick={onCancel}>
            Cancel
          </Button>
          <Button type="button" onClick={() => onApply(adjust)}>
            Apply
          </Button>
        </div>
      </div>
    </div>
  );
}
