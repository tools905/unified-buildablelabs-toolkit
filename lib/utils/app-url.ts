export const BASE_PATH = "/teams";

export function getAppUrl() {
  const configured = process.env.NEXT_PUBLIC_APP_URL?.trim();
  if (configured) return configured.replace(/\/$/, "");

  const productionUrl = process.env.VERCEL_PROJECT_PRODUCTION_URL?.trim();
  if (productionUrl) return `https://${productionUrl.replace(/^https?:\/\//, "").replace(/\/$/, "")}`;

  const vercelUrl = process.env.VERCEL_URL?.trim();
  if (vercelUrl) return `https://${vercelUrl.replace(/^https?:\/\//, "").replace(/\/$/, "")}`;

  return "http://localhost:3000";
}

// Use for links that point at an in-app route (emails, OAuth redirects) —
// getAppUrl() alone is also used for non-routed contexts (e.g. API referer headers).
export function getAppLink(path: string) {
  return `${getAppUrl()}${BASE_PATH}${path}`;
}
