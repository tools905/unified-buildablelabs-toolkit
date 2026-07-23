import type { NextConfig } from "next";
import { BASE_PATH } from "./lib/utils/app-url";

const nextConfig: NextConfig = {
  basePath: BASE_PATH,
  turbopack: {
    root: __dirname,
  },
};

export default nextConfig;
