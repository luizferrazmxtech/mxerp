import { beforeAll, beforeEach, describe, expect, it } from "vitest";
import { execSync } from "node:child_process";

const URL = "postgresql://mxerp:mxerp@localhost:5432/mxerp_test?schema=public";
process.env.DATABASE_URL = URL;

const { prisma } = await import("@/lib/db");
const inter = await import("@/lib/financeiro/inter");
const bol = await import("@/lib/financeiro/boletos");
const { naLoja } = await import("@/lib/empresa/loja");

beforeAll(() => {
  execSync("npx prisma migrate deploy", { env: { ...process.env, DATABASE_URL: URL }, stdio: "ignore" });
});
beforeEach(async () => {
  await prisma.$executeRawUnsafe(`TRUNCATE "IntegracaoInter", "Boleto", "Empresa" CASCADE`);
});

const linha = (id: string, empresaId: string | null) =>
  prisma.integracaoInter.create({ data: { id, empresaId, clientId: id, clientSecretCifrado: "x", certificado: "x", chaveCifrada: "x" } });

describe("Banco Inter por empresa", () => {
  it("cada empresa usa o seu Inter e a que não tem não usa o de outra", async () => {
    const a = await prisma.empresa.create({ data: { razaoSocial: "MXTECH LTDA", cnpj: "12965283000195" } });
    const b = await prisma.empresa.create({ data: { razaoSocial: "MXTECH SERVICE LTDA", cnpj: "36130603000155" } });
    await linha("inter", a.id);
    expect(await inter.idInterDaEmpresa(a.id)).toBe("inter");
    expect(await inter.idInterDaEmpresa(b.id)).toBeNull();
    expect(await inter.idInterDaEmpresa(null)).toBe("inter");
    expect(await naLoja(b.id, () => inter.interConfigurado())).toBe(false);
    expect(await naLoja(b.id, () => bol.contextoBoletos())).toBeNull();

    // salvar a configuração com a segunda empresa escolhida cria a dela
    const alvo = await naLoja(b.id, () => inter.idInterParaSalvar());
    expect(alvo).toEqual({ id: inter.idInterNovo(b.id), empresaId: b.id });
    await linha(alvo.id, b.id);
    expect(await inter.idInterDaEmpresa(b.id)).toBe(alvo.id);
    expect(await naLoja(a.id, () => inter.idInterParaSalvar())).toEqual({ id: "inter", empresaId: a.id });
    expect(await inter.idsInter()).toEqual(["inter", alvo.id].sort());
  });

  it("a configuração antiga sem dona fica com a primeira empresa quando a segunda ganha a dela", async () => {
    const a = await prisma.empresa.create({ data: { razaoSocial: "MXTECH LTDA", cnpj: "12965283000195", createdAt: new Date("2026-01-01") } });
    const b = await prisma.empresa.create({ data: { razaoSocial: "MXTECH SERVICE LTDA", cnpj: "36130603000155" } });
    await linha("inter", null);
    expect(await inter.idInterDaEmpresa(b.id)).toBe("inter"); // até ter a dela, a única que existe
    const alvo = await naLoja(b.id, () => inter.idInterParaSalvar());
    expect(alvo.id).toBe(inter.idInterNovo(b.id));
    expect((await prisma.integracaoInter.findUniqueOrThrow({ where: { id: "inter" } })).empresaId).toBe(a.id);
    expect(await inter.idInterDaEmpresa(b.id)).toBeNull();
  });
});
