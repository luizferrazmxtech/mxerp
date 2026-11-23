import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // backups do Gestão Click passam de 10 MB: o middleware (runtime nodejs) corta o corpo no limite dele e a ação
  // recebe o formulário sem o arquivo ("Escolha o arquivo .zip"), por isso os dois limites sobem juntos
  experimental: { serverActions: { bodySizeLimit: "100mb" }, middlewareClientMaxBodySize: "100mb" },
  // geram o PDF do DANFE no servidor (pdfkit lê as fontes do próprio pacote)
  serverExternalPackages: ["pdfkit", "bwip-js"],
};

export default nextConfig;
