// import type { NextConfig } from "next";

// /**
//  * Static export. The whole dataset is 698 rows generated at build time,
//  * so there is no server, no API and no database. The `out/` folder can be
//  * dropped onto any free static host (Netlify, GitHub Pages, Cloudflare Pages).
//  */
// const nextConfig: NextConfig = {
//   output: "export",
//   images: { unoptimized: true },
//   trailingSlash: true,
// };

// export default nextConfig;









import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  images: { unoptimized: true },
  trailingSlash: true,
};

export default nextConfig;