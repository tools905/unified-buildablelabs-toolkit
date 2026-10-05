"use client";

import { useEffect, useRef, useState } from "react";
import {
  findFoldIndex,
  foldCaption,
  normalizeCaption,
  tokenizeCaption,
  type PreviewPlatform,
} from "@/lib/utils/social-preview";

// The caption as a feed draws it: cut off with a "more" link, expandable, and with hashtags,
// mentions and links in the app's link colour. Where it is cut is measured in the real layout, so
// it follows the actual width of the post like the app does; a character-count guess is only used
// for the first paint, before the width is known.
export function FeedCaption({
  caption,
  platform,
  linkColor,
  mutedColor,
  lead,
  lines,
  lineHeight,
}: {
  caption: string;
  platform: PreviewPlatform;
  linkColor: string;
  mutedColor: string;
  // Instagram puts the account name in front of the first line.
  lead?: string;
  // How many lines show before "more", and how tall a line is in px.
  lines: number;
  lineHeight: number;
}) {
  const text = normalizeCaption(caption);
  const [expanded, setExpanded] = useState(false);
  const [cut, setCut] = useState<number | null>(null);
  const box = useRef<HTMLDivElement>(null);
  const meter = useRef<HTMLParagraphElement>(null);
  const ellipsis = platform === "instagram" ? "… " : "…";
  const moreLabel = platform === "instagram" ? "more" : "see more";

  useEffect(() => {
    const wrap = box.current;
    const probe = meter.current;
    if (!wrap || !probe || !text) return;

    function measure() {
      if (!wrap || !probe || wrap.clientWidth === 0) return;
      // Lay the candidate out in a hidden copy of the paragraph and see whether it stays within the lines.
      const fits = (candidate: string, withMore: boolean) => {
        probe.replaceChildren();
        if (lead) {
          const name = document.createElement("strong");
          name.style.fontWeight = "600";
          name.style.marginRight = "4px";
          name.textContent = lead;
          probe.append(name);
        }
        probe.append(document.createTextNode(candidate));
        if (withMore) probe.append(document.createTextNode(`${ellipsis}${moreLabel}`));
        return probe.getBoundingClientRect().height <= lines * lineHeight + 1;
      };
      setCut(fits(text, false) ? text.length : findFoldIndex(text, (candidate) => fits(candidate, true)));
    }

    const frame = requestAnimationFrame(measure);
    const observer = new ResizeObserver(measure);
    observer.observe(wrap);
    return () => {
      cancelAnimationFrame(frame);
      observer.disconnect();
    };
  }, [text, lead, lines, lineHeight, ellipsis, moreLabel]);

  if (!text) return null;

  const estimate = foldCaption(text, platform);
  const truncated = cut === null ? estimate.truncated : cut < text.length;
  const shown = expanded || !truncated ? text : cut === null ? estimate.visible : text.slice(0, cut).trimEnd();
  const parts = tokenizeCaption(shown);
  const paragraph = "whitespace-pre-wrap break-words text-sm";

  return (
    <div ref={box} className="relative">
      <p className={paragraph} style={{ lineHeight: `${lineHeight}px` }}>
        {lead ? <strong className="mr-1 font-semibold">{lead}</strong> : null}
        {parts.map((part, index) =>
          part.kind === "text" ? (
            <span key={index}>{part.value}</span>
          ) : (
            <span key={index} style={{ color: linkColor }}>
              {part.value}
            </span>
          ),
        )}
        {truncated && !expanded ? (
          <>
            <span style={{ color: mutedColor }}>{ellipsis}</span>
            <button type="button" onClick={() => setExpanded(true)} className="hover:underline" style={{ color: mutedColor }}>
              {moreLabel}
            </button>
          </>
        ) : null}
      </p>
      {/* A hidden copy used only to measure how much of the caption fits. */}
      <p
        ref={meter}
        aria-hidden="true"
        className={`${paragraph} pointer-events-none invisible absolute inset-x-0 top-0`}
        style={{ lineHeight: `${lineHeight}px` }}
      />
    </div>
  );
}
