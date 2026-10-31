import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  // The Express + Socket.IO server (server/index.ts) owns /api and /socket.io;
  // Next.js renders the UI only.
  images: { unoptimized: true },
  devIndicators: false, // keep the projector screen clean while developing
  typescript: { tsconfigPath: "tsconfig.json" },
};

export default nextConfig;
