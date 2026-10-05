import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  images: {
    qualities: [75, 90],
  },
  serverExternalPackages: ["sharp"],
  // Private snapshots, manifests, and credentials are local operator data.
  outputFileTracingExcludes: {
    "/*": ["./private/**/*"],
  },
};

export default nextConfig;
