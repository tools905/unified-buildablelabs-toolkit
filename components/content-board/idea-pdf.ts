import { BASE_PATH } from "@/lib/utils/app-url";

// The address that downloads one draft of an idea's post as a PDF: the draft made of `fileIds`, or
// the latest draft when none are given. A plain link: the server answers with a redirect to the file,
// which works on phones and in in-app browsers too.
// With `review`, it downloads that Pencil review: its draft with the marks drawn on.
export function ideaPdfUrl(ideaId: string, fileIds: string[] = [], options: { review?: string } = {}) {
  const base = `${BASE_PATH}/api/content-board/ideas/${encodeURIComponent(ideaId)}/pdf`;
  const query = [
    fileIds.length ? `files=${fileIds.map(encodeURIComponent).join(",")}` : null,
    options.review ? `review=${encodeURIComponent(options.review)}` : null,
  ].filter(Boolean);
  return query.length ? `${base}?${query.join("&")}` : base;
}
