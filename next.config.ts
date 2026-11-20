import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // planilhas de migração podem passar de 1 MB
  experimental: { serverActions: { bodySizeLimit: "25mb" } },
  // geram o PDF do DANFE no servidor (pdfkit lê as fontes do próprio pacote)
  serverExternalPackages: ["pdfkit", "bwip-js"],
};

export default nextConfig;
