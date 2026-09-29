import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  images: {
    qualities: [75, 90],
  },
  serverExternalPackages: ["sharp"],
};

export default nextConfig;
