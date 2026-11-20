import { beforeAll, beforeEach, describe, expect, it } from "vitest";
import { execSync } from "node:child_process";

const URL = "postgresql://mxerp:mxerp@localhost:5432/mxerp_test?schema=public";
process.env.DATABASE_URL = URL;

const { prisma } = await import("@/lib/db");
const { estimativaDoMes, mesAnterior } = await import("@/lib/fiscal/impostos");

let emp: string;
beforeAll(() => execSync("npx prisma migrate deploy", { env: { ...process.env, DATABASE_URL: URL }, stdio: "ignore" }));
beforeEach(async () => {
  await prisma.$executeRawUnsafe(`TRUNCATE "NotaEvento","NotaFiscal","AliquotaSimples","Empresa" CASCADE`);
  emp = (await prisma.empresa.create({ data: { razaoSocial: "MXTECH", cnpj: "12965283000195", cnae: "4751201" } })).id;
});

const nota = (numero: number, valor: number, cnae: string | null, status: "AUTORIZADA" | "CANCELADA" = "AUTORIZADA", ambiente: "PRODUCAO" | "HOMOLOGACAO" = "PRODUCAO") =>
  prisma.notaFiscal.create({ data: { empresaId: emp, modelo: cnae === "8020001" ? "NFSE" : "NFE", serie: 10, numero, status, ambiente, valorTotal: valor, cnae, emitidaEm: new Date("2026-11-10T15:00:00Z") } });

describe("imposto aproximado do Simples por CNAE", () => {
  it("soma as notas autorizadas em produção do mês por CNAE × alíquota do contador; '*' vale para as demais", async () => {
    await nota(1, 1000, "4751201"); await nota(2, 500, null); // sem CNAE na nota = CNAE da empresa
    await nota(3, 2000, "8020001");
    await nota(4, 9999, "4751201", "CANCELADA"); await nota(5, 9999, "4751201", "AUTORIZADA", "HOMOLOGACAO"); // não entram
    await prisma.aliquotaSimples.createMany({ data: [
      { empresaId: emp, competencia: "2026-11", cnae: "*", aliquota: 10.88 },
      { empresaId: emp, competencia: "2026-11", cnae: "8020001", aliquota: 8.35 },
    ] });
    const r = await estimativaDoMes(emp, "2026-11");
    expect(r.linhas.map((l) => [l.cnae, l.valor, l.aliquota, l.imposto])).toEqual([["8020001", 2000, 8.35, 167], ["4751201", 1500, 10.88, 163.2]]);
    expect([r.total, r.imposto, r.quantidade, r.canceladas]).toEqual([3500, 330.2, 3, 1]);
    expect((await estimativaDoMes(emp, "2026-10")).quantidade).toBe(0);
    expect(mesAnterior("2027-01")).toBe("2026-12");
  });

  it("aponta o CNAE sem alíquota no mês", async () => {
    await nota(1, 100, "4751201");
    const r = await estimativaDoMes(emp, "2026-11");
    expect(r.semAliquota).toEqual(["4751201"]);
    expect(r.imposto).toBe(0);
  });
});
