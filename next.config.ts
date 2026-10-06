import type { NextConfig } from "next";

/**
 * Server build (not static export): the AI assistant needs /api/chat and
 * /api/transcribe. All pages are client-rendered from public/data/portfolio.json.
 */
const nextConfig: NextConfig = {
  images: { unoptimized: true },
  trailingSlash: true,
};

export default nextConfig;
