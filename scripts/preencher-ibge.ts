// Preenche o código IBGE dos clientes/fornecedores que têm cidade e UF (cadastros vindos do Gestão Click).
//   docker exec mxerp-app-1 npx tsx scripts/preencher-ibge.ts
import { prisma } from "@/lib/db";
import { preencherCodigosIbge } from "@/lib/cadastros/municipio";

preencherCodigosIbge()
  .then((r) => console.log(JSON.stringify(r, null, 2)))
  .finally(() => prisma.$disconnect());
