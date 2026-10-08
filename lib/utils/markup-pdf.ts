import { LineCapStyle, rgb, type PDFPage } from "pdf-lib";
import { HIGHLIGHTER_OPACITY, strokePath, type MarkupStroke } from "@/lib/utils/markup";

function hexToRgb(hex: string) {
  const value = Number.parseInt(hex.replace("#", ""), 16);
  return rgb(((value >> 16) & 255) / 255, ((value >> 8) & 255) / 255, (value & 255) / 255);
}

// Draws a Pencil review's strokes onto one page of a PDF, in the same places they were drawn on screen.
export function drawMarksOnPage(page: PDFPage, strokes: MarkupStroke[]) {
  const box = page.getMediaBox();
  const { width, height } = page.getSize();
  for (const stroke of strokes) {
    const path = strokePath(stroke.points, width, height);
    if (!path) continue;
    page.drawSvgPath(path, {
      // SVG paths run down from the top-left corner; this places that corner at the page's top-left.
      x: box.x,
      y: box.y + height,
      borderColor: hexToRgb(stroke.color),
      borderWidth: Math.max(0.5, stroke.width * width),
      borderOpacity: stroke.tool === "highlighter" ? HIGHLIGHTER_OPACITY : 1,
      borderLineCap: LineCapStyle.Round,
    });
  }
}
