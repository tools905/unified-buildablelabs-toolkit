// Size and alignment for an image inside a newsletter story. It is kept in the image's own
// address as "#nl=<size>,<align>", so the story text stays plain markdown and an image with
// no settings keeps working as a full-width, centred picture.
export type StoryImageSize = "small" | "medium" | "full";
export type StoryImageAlign = "left" | "center";

export type StoryImage = {
  alt: string;
  url: string;
  size: StoryImageSize;
  align: StoryImageAlign;
};

export const STORY_IMAGE_WIDTH: Record<StoryImageSize, string> = {
  small: "40%",
  medium: "65%",
  full: "100%",
};

export const STORY_IMAGE_SIZES: { value: StoryImageSize; label: string }[] = [
  { value: "small", label: "Small" },
  { value: "medium", label: "Medium" },
  { value: "full", label: "Full width" },
];

export const STORY_IMAGE_ALIGNS: { value: StoryImageAlign; label: string }[] = [
  { value: "left", label: "Left" },
  { value: "center", label: "Center" },
];

const SETTINGS = /^(.*)#nl=(small|medium|full),(left|center)$/;
const IMAGE_LINE = /^!\[([^\]]*)\]\(([^)\s]+)\)$/;

// Splits an image address into the plain address and its settings.
export function splitImageSettings(src: string): { url: string; size: StoryImageSize; align: StoryImageAlign } {
  const match = src.match(SETTINGS);
  if (!match) return { url: src, size: "full", align: "center" };
  return { url: match[1], size: match[2] as StoryImageSize, align: match[3] as StoryImageAlign };
}

export function parseStoryImageLine(line: string): StoryImage | null {
  const match = line.trim().match(IMAGE_LINE);
  if (!match) return null;
  return { alt: match[1], ...splitImageSettings(match[2]) };
}

export function formatStoryImage(image: StoryImage) {
  const isDefault = image.size === "full" && image.align === "center";
  return `![${image.alt}](${image.url}${isDefault ? "" : `#nl=${image.size},${image.align}`})`;
}

// The image line that holds the caret, if the caret is on one.
export function findStoryImageAt(body: string, caret: number) {
  const start = body.lastIndexOf("\n", Math.max(0, caret) - 1) + 1;
  const newline = body.indexOf("\n", caret);
  const end = newline === -1 ? body.length : newline;
  const image = parseStoryImageLine(body.slice(start, end));
  return image ? { start, end, image } : null;
}

// Inline style for the rendered picture. Only fixed values from the lists above are used.
export function storyImageStyle(size: StoryImageSize, align: StoryImageAlign) {
  const left = align === "center" || size === "full" ? "auto" : "0";
  return `display:block;width:${STORY_IMAGE_WIDTH[size]};max-width:100%;margin-left:${left};margin-right:auto`;
}
