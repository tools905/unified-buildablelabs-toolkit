import type { NextConfig } from "next";
import { BASE_PATH } from "./lib/utils/app-url";

const nextConfig: NextConfig = {
  basePath: BASE_PATH,
  turbopack: {
    root: __dirname,
  },
  experimental: {
    // Keep pages the browser has already loaded for 30 seconds, so going back and forth between
    // them is instant. Saving anything (server actions) refreshes them straight away.
    staleTimes: {
      dynamic: 30,
    },
  },
  // These pages were folded into the Dashboard (the full tool catalog and the admin overview) or
  // removed. Old links and bookmarks land on the Dashboard instead of a 404.
  async redirects() {
    return ["/tools", "/admin", "/admin/settings", "/admin/tools"].map((source) => ({
      source,
      destination: "/dashboard",
      permanent: false,
    }));
  },
};

export default nextConfig;
