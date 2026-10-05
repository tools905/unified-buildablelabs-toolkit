import { BASE_PATH } from "@/lib/utils/app-url";

// The address that downloads one draft of an idea's post as a PDF: the draft made of `fileIds`, or
// the latest draft when none are given. A plain link: the server answers with a redirect to the file,
// which works on phones and in in-app browsers too.
export function ideaPdfUrl(ideaId: string, fileIds: string[] = []) {
  const base = `${BASE_PATH}/api/content-board/ideas/${encodeURIComponent(ideaId)}/pdf`;
  return fileIds.length ? `${base}?files=${fileIds.map(encodeURIComponent).join(",")}` : base;
}
