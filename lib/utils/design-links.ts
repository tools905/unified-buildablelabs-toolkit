// Returns an https URL that can safely be shown in an <iframe>, or null when the
// link can't be embedded (the panel then offers "open in a new tab" instead).
export function toEmbedUrl(rawUrl: string): string | null {
  let url: URL;
  try {
    url = new URL(rawUrl);
  } catch {
    return null;
  }
  if (url.protocol !== "https:") return null;

  const host = url.hostname.replace(/^www\./, "").toLowerCase();

  if (host === "figma.com") {
    if (!/^\/(file|design|proto|board|slides)\//.test(url.pathname)) return null;
    return `https://www.figma.com/embed?embed_host=share&url=${encodeURIComponent(url.toString())}`;
  }

  if (host === "canva.com") {
    if (!/^\/design\/[^/]+\/(?:[^/]+\/)?(view|watch)\/?$/.test(url.pathname)) return null;
    return `https://www.canva.com${url.pathname.replace(/\/$/, "")}?embed`;
  }

  if (host === "drive.google.com") {
    const match = url.pathname.match(/^\/file\/d\/([^/]+)/);
    return match ? `https://drive.google.com/file/d/${match[1]}/preview` : null;
  }

  if (host === "docs.google.com") {
    const match = url.pathname.match(/^\/(presentation|document|spreadsheets)\/d\/([^/]+)/);
    if (!match) return null;
    const [, kind, id] = match;
    return `https://docs.google.com/${kind}/d/${id}/${kind === "presentation" ? "embed" : "preview"}`;
  }

  return null;
}

export function isHttpsUrl(value: string): boolean {
  try {
    return new URL(value).protocol === "https:";
  } catch {
    return false;
  }
}
