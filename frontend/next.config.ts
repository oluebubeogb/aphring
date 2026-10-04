import type { NextConfig } from "next";

const backendUrl =
  process.env.BACKEND_URL ||
  process.env.API_URL ||
  "http://backend:4000";

const nextConfig: NextConfig = {
  output: "standalone",
  images: {
    unoptimized: true,
  },
  async rewrites() {
    return [
      {
        source: "/api/:path*",
        destination: `${backendUrl}/api/:path*`,
      },
    ];
  },
};

export default nextConfig;
