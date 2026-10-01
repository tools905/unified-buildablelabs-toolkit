// How long a CDN (and the visitor's browser) may reuse the public newsletter responses.
// The website's Times page asks for these on every visit, and each answer costs several
// database round trips, so reuse it for a minute. Stale copies may be served for a few more
// minutes while a fresh one is fetched in the background. The trade-off: a post that was just
// published or deleted can take up to a minute to show up on (or vanish from) the website.
export const PUBLIC_FEED_CACHE_CONTROL = "public, max-age=30, s-maxage=60, stale-while-revalidate=300";

// A missing post is cached only briefly, so a post published a moment later appears quickly.
export const PUBLIC_NOT_FOUND_CACHE_CONTROL = "public, max-age=0, s-maxage=15";

export const PUBLIC_CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
};

export function publicFeedHeaders(cacheControl: string) {
  return { ...PUBLIC_CORS_HEADERS, "Cache-Control": cacheControl };
}
