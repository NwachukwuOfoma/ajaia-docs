import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Native/Node-only packages stay out of the bundle and are required at runtime.
  serverExternalPackages: ["@libsql/client", "libsql", "mammoth"],
};

export default nextConfig;
