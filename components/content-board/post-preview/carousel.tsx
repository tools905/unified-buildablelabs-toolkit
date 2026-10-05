"use client";

import { useEffect, useRef, useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { SlideView } from "@/components/content-board/post-preview/slide-view";
import type { LoadedSlide } from "@/components/content-board/post-preview/use-post-slides";
import { cn } from "@/lib/utils/cn";

// The swipeable media area of a post. Native scrolling with snap points, so touch swiping, trackpad
// swiping and the arrow buttons all work. `onIndexChange` lets the frame draw its own dots or counter.
export function Carousel({
  slides,
  ratio,
  onIndexChange,
  arrows = true,
  className,
}: {
  slides: LoadedSlide[];
  // Width divided by height of the frame.
  ratio: number;
  onIndexChange?: (index: number) => void;
  arrows?: boolean;
  className?: string;
}) {
  const track = useRef<HTMLDivElement>(null);
  const [index, setIndex] = useState(0);

  // A different set of slides starts again from the first.
  const firstId = slides[0]?.id;
  useEffect(() => {
    track.current?.scrollTo({ left: 0 });
  }, [firstId, slides.length]);

  // Where the last arrow click was heading. A second click before the first has landed (the slide
  // is still sliding, or a PDF page is busy drawing) goes one further instead of aiming at the same slide.
  const heading = useRef<{ index: number; at: number } | null>(null);

  function go(step: number) {
    const element = track.current;
    if (!element || element.clientWidth === 0) return;
    const settled = Math.round(element.scrollLeft / element.clientWidth);
    const flying = heading.current && performance.now() - heading.current.at < 1500;
    const from = flying && heading.current ? heading.current.index : settled;
    const next = Math.min(slides.length - 1, Math.max(0, from + step));
    heading.current = { index: next, at: performance.now() };
    element.scrollTo({ left: next * element.clientWidth, behavior: "smooth" });
  }

  function onScroll() {
    const element = track.current;
    if (!element || element.clientWidth === 0) return;
    const next = Math.round(element.scrollLeft / element.clientWidth);
    if (next !== index) {
      setIndex(next);
      onIndexChange?.(next);
    }
  }

  const current = Math.min(index, Math.max(0, slides.length - 1));

  return (
    <div className={cn("group relative w-full overflow-hidden", className)} style={{ aspectRatio: String(ratio) }}>
      <div
        ref={track}
        onScroll={onScroll}
        tabIndex={0}
        role="group"
        aria-roledescription="carousel"
        aria-label="Post slides"
        onKeyDown={(event) => {
          if (event.key === "ArrowRight") {
            event.preventDefault();
            go(1);
          } else if (event.key === "ArrowLeft") {
            event.preventDefault();
            go(-1);
          }
        }}
        className="flex h-full w-full snap-x snap-mandatory overflow-x-auto scroll-smooth outline-none [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
      >
        {slides.map((slide, i) => (
          <div
            key={slide.id}
            role="group"
            aria-roledescription="slide"
            aria-label={`${i + 1} of ${slides.length}`}
            className="h-full w-full shrink-0 snap-center"
          >
            <SlideView slide={slide} near={Math.abs(i - current) <= 1} />
          </div>
        ))}
      </div>

      {arrows && slides.length > 1 ? (
        <>
          {current > 0 ? (
            <button
              type="button"
              onClick={() => go(-1)}
              aria-label="Previous slide"
              className="absolute left-2 top-1/2 grid h-7 w-7 [@media(hover:none)]:hidden -translate-y-1/2 place-items-center rounded-full bg-white/90 text-neutral-800 shadow transition-opacity sm:opacity-0 sm:group-hover:opacity-100"
            >
              <ChevronLeft className="h-4 w-4" />
            </button>
          ) : null}
          {current < slides.length - 1 ? (
            <button
              type="button"
              onClick={() => go(1)}
              aria-label="Next slide"
              className="absolute right-2 top-1/2 grid h-7 w-7 [@media(hover:none)]:hidden -translate-y-1/2 place-items-center rounded-full bg-white/90 text-neutral-800 shadow transition-opacity sm:opacity-0 sm:group-hover:opacity-100"
            >
              <ChevronRight className="h-4 w-4" />
            </button>
          ) : null}
        </>
      ) : null}
    </div>
  );
}
