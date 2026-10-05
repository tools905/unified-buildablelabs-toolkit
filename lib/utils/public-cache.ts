// How long a CDN (and the visitor's browser) may reuse the public newsletter responses.
// The website's Times page asks for these on every visit, and an uncached answer means a trip
// to Sydney for the function plus several database round trips (about a second from India).
// So the CDN keeps a good answer for five minutes and may hand out a stale one for a day while
// it fetches a fresh copy in the background: nearly every visitor gets the fast cached path.
// Browsers keep it for only 30 seconds. The trade-off: a post that was just published or
// deleted can take up to five minutes to show up on (or vanish from) the website.
export const PUBLIC_FEED_CACHE_CONTROL = "public, max-age=30, s-maxage=300, stale-while-revalidate=86400";

// A missing post is cached only briefly, so a post published a moment later appears quickly.
export const PUBLIC_NOT_FOUND_CACHE_CONTROL = "public, max-age=0, s-maxage=15";

// The newsletter capture points' wording and timing changes rarely; a change can take up to
// five minutes to reach readers.
export const CAPTURE_CONFIG_CACHE_CONTROL = "public, max-age=60, s-maxage=300, stale-while-revalidate=86400";

export const PUBLIC_CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
};

export function publicFeedHeaders(cacheControl: string) {
  return { ...PUBLIC_CORS_HEADERS, "Cache-Control": cacheControl };
}
