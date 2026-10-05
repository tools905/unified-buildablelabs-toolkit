import { htmlToPlainText } from "@/lib/capsule/html";
import type { CapsulePlatform } from "@/lib/capsule/types";

// Addresses that open each platform's "new post" editor. There is no supported way to pre-fill them,
// so the post travels on the clipboard and these only take the writer to the right place.
export const MEDIUM_NEW_POST_URL = "https://medium.com/new-story";

export function substackNewPostUrl(publication: string) {
  const name = publication.trim().replace(/^https?:\/\//, "").replace(/\.substack\.com.*$/, "");
  return `https://${name}.substack.com/publish/post?type=newsletter`;
}

export function editorUrl(platform: CapsulePlatform, substackPublication: string) {
  return platform === "medium" ? MEDIUM_NEW_POST_URL : substackNewPostUrl(substackPublication);
}

// How the click puts the post on the clipboard and opens the editor. Browsers only allow both shortly
// after a real click, and they disagree on how strictly (Safari is the strict one), so the test page
// tries each and the app uses whichever works everywhere.
export type OpenStrategy =
  | "copy-then-open" // copy, wait, then open the tab (the plan's first idea)
  | "open-then-copy" // open a blank tab straight away, copy, then send the tab to the editor
  | "together"; // start the copy and open the tab in the same instant

// The way the Publish menu copies and opens until the browser tests (see the Paste lab) say otherwise.
// Copying first means a new tab can't take the page's focus before the copy happens; if the browser
// then blocks the tab, the menu offers a second click that opens it.
export const DEFAULT_OPEN_STRATEGY: OpenStrategy = "copy-then-open";

export type CopyAndOpenResult = {
  strategy: OpenStrategy;
  copied: boolean;
  opened: boolean; // false when the browser blocked the new tab
  how?: "clipboard-api" | "selection-fallback";
  error?: string;
  ms: number;
};

type Payload = { html: string; text?: string };

function selectionCopy(html: string): boolean {
  // Last resort for browsers without ClipboardItem: select a hidden rendered copy and run "copy".
  const holder = document.createElement("div");
  holder.contentEditable = "true";
  holder.style.cssText = "position:fixed;left:-9999px;top:0;opacity:0;white-space:pre-wrap;";
  holder.innerHTML = html;
  document.body.appendChild(holder);
  const selection = window.getSelection();
  const range = document.createRange();
  range.selectNodeContents(holder);
  selection?.removeAllRanges();
  selection?.addRange(range);
  let ok = false;
  try {
    ok = document.execCommand("copy");
  } catch {
    ok = false;
  }
  selection?.removeAllRanges();
  document.body.removeChild(holder);
  return ok;
}

// Copies the post as rich text (HTML) plus a plain-text twin. Must run inside a click handler.
export async function copyAtom(payload: Payload): Promise<{ how: "clipboard-api" | "selection-fallback" }> {
  const text = payload.text ?? htmlToPlainText(payload.html);
  if (typeof ClipboardItem !== "undefined" && typeof navigator.clipboard?.write === "function") {
    try {
      await navigator.clipboard.write([
        new ClipboardItem({
          "text/html": new Blob([payload.html], { type: "text/html" }),
          "text/plain": new Blob([text], { type: "text/plain" }),
        }),
      ]);
      return { how: "clipboard-api" };
    } catch {
      // fall through to the selection method below
    }
  }
  if (selectionCopy(payload.html)) return { how: "selection-fallback" };
  throw new Error("The browser refused to copy.");
}

export async function copyAndOpen(strategy: OpenStrategy, payload: Payload, url: string): Promise<CopyAndOpenResult> {
  const started = performance.now();
  const done = (result: Omit<CopyAndOpenResult, "strategy" | "ms">): CopyAndOpenResult => ({
    strategy,
    ms: Math.round(performance.now() - started),
    ...result,
  });

  try {
    if (strategy === "copy-then-open") {
      const { how } = await copyAtom(payload);
      const tab = window.open(url, "_blank", "noopener");
      return done({ copied: true, how, opened: tab !== null });
    }

    if (strategy === "open-then-copy") {
      const tab = window.open("about:blank", "_blank");
      try {
        const { how } = await copyAtom(payload);
        if (tab) {
          tab.opener = null;
          tab.location.href = url;
        }
        return done({ copied: true, how, opened: tab !== null });
      } catch (failure) {
        tab?.close();
        throw failure;
      }
    }

    // together
    const copying = copyAtom(payload);
    const tab = window.open(url, "_blank", "noopener");
    const { how } = await copying;
    return done({ copied: true, how, opened: tab !== null });
  } catch (failure) {
    return done({ copied: false, opened: false, error: failure instanceof Error ? failure.message : "Something went wrong." });
  }
}

// Copies plain text (a title, a link) from a click. Falls back to a hidden field where the clipboard
// API is missing or refused.
export async function copyText(text: string): Promise<boolean> {
  try {
    if (typeof navigator.clipboard?.writeText === "function") {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch {
    /* try the fallback below */
  }
  const field = document.createElement("textarea");
  field.value = text;
  field.setAttribute("readonly", "");
  field.style.cssText = "position:fixed;left:-9999px;top:0;opacity:0;";
  document.body.appendChild(field);
  field.select();
  let ok = false;
  try {
    ok = document.execCommand("copy");
  } catch {
    ok = false;
  }
  document.body.removeChild(field);
  return ok;
}

// The two-click backup: the first click copies, the second opens. Each is its own real click.
export function openEditor(url: string): boolean {
  return window.open(url, "_blank", "noopener") !== null;
}
