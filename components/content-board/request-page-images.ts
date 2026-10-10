import { BASE_PATH } from "@/lib/utils/app-url";

// Asks the server to draw a PDF's page pictures (see content-page-images-service.ts), calling again
// while a long PDF is still being drawn. Runs quietly in the background, once per file per visit: the
// PDF is shown as it is meanwhile, and the pictures are used from the next time the idea is opened.
const requested = new Set<string>();

export function requestPageImages(attachmentId: string) {
  if (requested.has(attachmentId)) return;
  requested.add(attachmentId);
  void (async () => {
    for (let attempt = 0; attempt < 12; attempt++) {
      try {
        const response = await fetch(`${BASE_PATH}/api/content-board/attachments/${encodeURIComponent(attachmentId)}/pages`, { method: "POST" });
        if (!response.ok) return;
        const progress = (await response.json()) as { ready: boolean; busy?: boolean };
        if (progress.ready) return;
        // Someone else's screen is drawing them: check back shortly.
        if (progress.busy) await new Promise((resolve) => setTimeout(resolve, 15000));
      } catch {
        return;
      }
    }
  })();
}
