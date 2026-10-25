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
  async redirects() {
    return [
      { source: "/admin", destination: "/workstation", permanent: false },
      { source: "/community", destination: "/explore", permanent: false },
      { source: "/community/:slug*", destination: "/explore", permanent: false },
    ];
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
