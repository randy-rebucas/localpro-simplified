import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  serverExternalPackages: ["mongoose"],
  
  headers: async () => [
    {
      source: "/:path*",
      headers: [
        {
          key: "X-Content-Type-Options",
          value: "nosniff",
        },
        {
          key: "X-Frame-Options",
          value: "DENY",
        },
        {
          key: "X-XSS-Protection",
          value: "1; mode=block",
        },
        {
          key: "Referrer-Policy",
          value: "strict-origin-when-cross-origin",
        },
        {
          key: "Content-Security-Policy",
          value:
            "default-src 'self'; script-src 'self' 'unsafe-inline' 'unsafe-eval'; style-src 'self' 'unsafe-inline'; img-src 'self' data: https:; font-src 'self' data:",
        },
      ],
    },
    {
      source: "/(api)/:path*",
      headers: [
        {
          key: "X-Content-Type-Options",
          value: "application/json",
        },
      ],
    },
  ],
};

export default nextConfig;
