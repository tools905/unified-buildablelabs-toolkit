// Pencil reviews: marks drawn straight onto the pages of a draft. Everything here is plain functions so
// the screen, the server and the PDF download all treat strokes the same way.
//
// A stroke's points are stored relative to its page: x and y run from 0 to 1 across and down. That keeps
// the marks on the right spot whatever size the page is shown at, and in the downloaded PDF.

export type MarkupTool = "pen" | "highlighter";

export type MarkupStroke = {
  tool: MarkupTool;
  color: string;
  // Line thickness as a share of the page's width.
  width: number;
  // x1, y1, x2, y2, … each between 0 and 1.
  points: number[];
};

// A submitted review as the panel lists it (without strokes), and one of its pages with strokes.
export type MarkupReviewSummary = {
  id: string;
  createdAt: string;
  createdBy: string;
  authorName: string;
  note: string | null;
  fileIds: string[];
  pages: { attachmentId: string; pageNumber: number }[];
};

export type MarkupReviewPage = { attachmentId: string; pageNumber: number; strokes: MarkupStroke[] };

// The pen's colours; any other shade can be picked too.
export const MARKUP_PENS = [
  { label: "Red", color: "#E5372B" },
  { label: "Orange", color: "#F97316" },
  { label: "Yellow", color: "#FACC15" },
  { label: "Green", color: "#16A34A" },
  { label: "Teal", color: "#0D9488" },
  { label: "Blue", color: "#2563EB" },
  { label: "Purple", color: "#7C3AED" },
  { label: "Pink", color: "#EC4899" },
  { label: "Brown", color: "#92400E" },
  { label: "Grey", color: "#6B7280" },
  { label: "Black", color: "#111111" },
  { label: "White", color: "#FFFFFF" },
] as const;
export const HIGHLIGHTER_COLOR = "#FACC15";

export const HIGHLIGHTER_OPACITY = 0.45;

// Line sizes are chosen on a slider, in screen pixels at the zoom the line is drawn at, so a line looks
// exactly as thick while it's drawn as after the Pencil lifts, and writing zoomed in comes out finer on
// the page, like Apple's own Markup.
export const SIZE_RANGE = { pen: { min: 1, max: 24, initial: 3 }, highlighter: { min: 6, max: 48, initial: 18 } } as const;

// A line's thickness as a share of the page's width, from its size on screen.
export function strokeWidth(sizePx: number, pageWidthPx: number, zoom = 1) {
  const shown = Math.max(1, pageWidthPx) * (Number.isFinite(zoom) && zoom > 0 ? zoom : 1);
  return Number(Math.min(0.1, Math.max(0.0002, sizePx / shown)).toFixed(5));
}

const round = (value: number) => Math.round(value * 10000) / 10000;

// Drops points that add nothing (closer than `minStep` to the last one kept) and rounds the rest, so a
// review stays small to save and quick to draw. The last point is always kept.
export function simplifyPoints(points: number[], minStep = 0.0005): number[] {
  if (points.length < 4) return points.map(round);
  const kept: number[] = [round(points[0]), round(points[1])];
  for (let i = 2; i < points.length; i += 2) {
    const x = points[i];
    const y = points[i + 1];
    const lastX = kept[kept.length - 2];
    const lastY = kept[kept.length - 1];
    const isLast = i === points.length - 2;
    if (Math.hypot(x - lastX, y - lastY) >= minStep || isLast) {
      kept.push(round(x), round(y));
    }
  }
  return kept;
}

// The stroke as an SVG path, for a page drawn `width` by `height` units. The line runs in smooth curves
// through the middle of each step (the points the Pencil reports are joined up the way a pen would move,
// not with straight, jagged pieces). A single dot becomes a tiny line so it still shows.
export function strokePath(points: number[], width: number, height: number) {
  if (points.length < 2) return "";
  const x = (i: number) => points[i * 2] * width;
  const y = (i: number) => points[i * 2 + 1] * height;
  const f = (value: number) => value.toFixed(2);
  const count = points.length / 2;
  if (count === 1) return `M${f(x(0))} ${f(y(0))} L${f(x(0) + 0.01)} ${f(y(0))}`;
  if (count === 2) return `M${f(x(0))} ${f(y(0))} L${f(x(1))} ${f(y(1))}`;
  const parts = [`M${f(x(0))} ${f(y(0))}`];
  for (let i = 1; i < count - 1; i++) {
    parts.push(`Q${f(x(i))} ${f(y(i))} ${f((x(i) + x(i + 1)) / 2)} ${f((y(i) + y(i + 1)) / 2)}`);
  }
  parts.push(`L${f(x(count - 1))} ${f(y(count - 1))}`);
  return parts.join(" ");
}

// Removes every stroke that passes within `radius` of a point (radius as a share of the page width).
// `aspect` is the page's height divided by its width, so distances down the page are measured fairly.
export function eraseAt(strokes: MarkupStroke[], x: number, y: number, radius: number, aspect: number): MarkupStroke[] {
  // Distances are measured against each segment of the line, not just its points, so sweeping across
  // a long straight line between two far-apart points still catches it.
  const distanceToSegment = (ax: number, ay: number, bx: number, by: number) => {
    const px = x;
    const py = y * aspect;
    const sx = ax;
    const sy = ay * aspect;
    const ex = bx;
    const ey = by * aspect;
    const lengthSquared = (ex - sx) ** 2 + (ey - sy) ** 2;
    const t = lengthSquared === 0 ? 0 : Math.max(0, Math.min(1, ((px - sx) * (ex - sx) + (py - sy) * (ey - sy)) / lengthSquared));
    return Math.hypot(px - (sx + t * (ex - sx)), py - (sy + t * (ey - sy)));
  };
  return strokes.filter((stroke) => {
    const reach = radius + stroke.width / 2;
    const points = stroke.points;
    if (points.length === 2) return distanceToSegment(points[0], points[1], points[0], points[1]) > reach;
    for (let i = 0; i + 3 < points.length; i += 2) {
      if (distanceToSegment(points[i], points[i + 1], points[i + 2], points[i + 3]) <= reach) return false;
    }
    return true;
  });
}

export function markupPageKey(attachmentId: string, pageNumber: number) {
  return `${attachmentId}:${pageNumber}`;
}

// "page 3", "pages 2 and 5", "pages 2, 5 and 7".
export function describePages(positions: number[]) {
  const sorted = [...new Set(positions)].sort((a, b) => a - b);
  if (sorted.length === 0) return "no pages";
  if (sorted.length === 1) return `page ${sorted[0]}`;
  return `pages ${sorted.slice(0, -1).join(", ")} and ${sorted[sorted.length - 1]}`;
}
