import type { NextConfig } from "next";
import path from "node:path";

/**
 * Server build (not static export): the AI assistant needs /api/chat and
 * /api/transcribe. All pages are client-rendered from public/data/portfolio.json.
 */
const nextConfig: NextConfig = {
  images: { unoptimized: true },
  trailingSlash: true,
  // Pin the project root so Turbopack never walks up into parent folders.
  turbopack: { root: path.resolve(__dirname) },
};

export default nextConfig;
