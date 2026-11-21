import { defineConfig } from "vitest/config";
import path from "node:path";

export default defineConfig({
  resolve: { alias: { "@": path.resolve(__dirname, "src") } },
  test: { environment: "node", fileParallelism: false, testTimeout: 30000, env: { DATABASE_URL: process.env.DATABASE_URL_TESTE ?? "postgresql://postgres:postgres@localhost:5432/central_test?schema=public", CHAVE_SEGREDOS: "chave-de-teste-1234567890abcdef" } },
});
