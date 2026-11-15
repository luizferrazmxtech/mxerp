import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // planilhas de migração podem passar de 1 MB
  experimental: { serverActions: { bodySizeLimit: "25mb" } },
};

export default nextConfig;
