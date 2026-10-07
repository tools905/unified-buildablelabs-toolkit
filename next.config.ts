import type { NextConfig } from "next";
import { BASE_PATH } from "./lib/utils/app-url";

const nextConfig: NextConfig = {
  basePath: BASE_PATH,
  // Read from node_modules at run time instead of being bundled: the connector draws PDF pages on the
  // server with these, and the drawing surface is a native module that can't be bundled.
  serverExternalPackages: ["pdfjs-dist", "@napi-rs/canvas"],
  // The PDF reader loads its worker, fonts and character maps by path at run time, which the build can't see, so
  // they are listed for the routes that draw or open PDFs.
  outputFileTracingIncludes: Object.fromEntries(
    ["/api/mcp", "/api/mcp-upload/[token]/complete"].map((route) => [
      route,
      [
        "./node_modules/pdfjs-dist/legacy/build/pdf.worker.mjs",
        "./node_modules/pdfjs-dist/standard_fonts/**",
        "./node_modules/pdfjs-dist/cmaps/**",
      ],
    ]),
  ),
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
