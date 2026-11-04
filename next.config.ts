import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  experimental: {
    serverActions: {
      // The only form is "Reportar um erro": a few short fields. Anything
      // larger is refused before it is read (default 1 MB; 4 November 2026).
      bodySizeLimit: "16kb",
    },
  },
};

export default nextConfig;
