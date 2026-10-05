import { BASE_PATH } from "@/lib/utils/app-url";

// The address that downloads an idea's post as one PDF. A plain link: the server answers with a
// redirect to the file, which works on phones and in in-app browsers too.
export function ideaPdfUrl(ideaId: string) {
  return `${BASE_PATH}/api/content-board/ideas/${encodeURIComponent(ideaId)}/pdf`;
}
