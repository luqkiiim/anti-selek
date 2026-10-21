import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  images: {
    qualities: [75, 90],
  },
  serverExternalPackages: ["sharp"],
  outputFileTracingExcludes: {
    "/*": [
      // Private snapshots, manifests, and credentials are local operator data.
      "./private/**/*",
      // This schema uses SQLite/Turso only. Keep its native engine and SQLite WASM.
      "./node_modules/@prisma/client/runtime/query_engine_bg.mysql.{js,wasm}",
      "./node_modules/@prisma/client/runtime/query_engine_bg.postgresql.{js,wasm}",
    ],
  },
};

export default nextConfig;
