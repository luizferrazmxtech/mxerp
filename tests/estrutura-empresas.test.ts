import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { execSync } from "node:child_process";

const URL = "postgresql://mxerp:mxerp@localhost:5432/mxerp_test?schema=public";
process.env.DATABASE_URL = URL;

const { prisma } = await import("@/lib/db");
const { naLoja, limparCacheLojas, LOJA_ATUAL } = await import("@/lib/empresa/loja");
const { espelharEstrutura } = await import("@/lib/empresa/estrutura");

beforeAll(() => {
  execSync("npx prisma migrate deploy", { env: { ...process.env, DATABASE_URL: URL }, stdio: "ignore" });
});
const TABELAS = ["CategoriaFinanceira", "FormaPagamento", "ContaBancaria", "ModeloMensagem", "SituacaoOsConfig", "SituacaoVendaConfig", "SituacaoCompraConfig", "SituacaoOrcamento", "CentroCusto", "CanalVenda", "CampoExtra"];
/** Apaga só o que os testes daqui criam (as situações e o plano padrão das migrações ficam para os outros testes). */
async function limpar() {
  await prisma.$executeRawUnsafe(`TRUNCATE "Empresa", "Pessoa" CASCADE`);
  for (const t of TABELAS) await prisma.$executeRawUnsafe(`DELETE FROM "${t}" WHERE "empresaId" <> '' OR nome LIKE 'T-%'`).catch(() => prisma.$executeRawUnsafe(`DELETE FROM "${t}" WHERE "empresaId" <> ''`));
  await prisma.$executeRawUnsafe(`DELETE FROM "ModeloMensagem" WHERE assunto LIKE 'T-%'`);
  await prisma.$executeRawUnsafe(`DELETE FROM "Configuracao" WHERE chave LIKE '%#emp:%' OR chave IN ('contratos', 'whatsapp')`);
  limparCacheLojas();
}
beforeEach(limpar);
afterAll(limpar);

async function duasEmpresas() {
  const a = await prisma.empresa.create({ data: { razaoSocial: "MXTECH LTDA", cnpj: "12965283000195", createdAt: new Date("2026-01-01") } });
  const b = await prisma.empresa.create({ data: { razaoSocial: "MXTECH SERVICE LTDA", cnpj: "36130603000155" } });
  limparCacheLojas();
  return { a, b };
}

describe("estrutura separada por empresa", () => {
  it("a empresa nova nasce com a cópia da principal e depois cada uma muda a sua", async () => {
    const { a, b } = await duasEmpresas();
    // estrutura da principal (gravada sem empresa no contexto = principal)
    const pai = await prisma.categoriaFinanceira.create({ data: { nome: "T-Despesas", tipo: "PAGAR", grupoDre: "DESPESA_OPERACIONAL" } });
    await prisma.categoriaFinanceira.create({ data: { nome: "T-Energia", tipo: "PAGAR", grupoDre: "DESPESA_OPERACIONAL", paiId: pai.id } });
    await prisma.formaPagamento.create({ data: { nome: "T-PIX", tPag: "17" } });
    await prisma.contaBancaria.create({ data: { nome: "T-INTER MXTECH" } });
    const modelo = await prisma.modeloMensagem.create({ data: { tipo: "OS", assunto: "T-OS pronta", email: "Sua OS está pronta" } });
    const sv = await prisma.situacaoVendaConfig.create({ data: { nome: "T-Concretizada", cor: "#0a0", ordem: 1, modeloMensagemId: modelo.id } });
    await prisma.configuracao.create({ data: { chave: "contratos", valor: { situacaoVendaId: sv.id, diasAntecedencia: 10 } } });
    await prisma.configuracao.create({ data: { chave: "whatsapp", valor: { token: "segredo-da-mxtech" } } });

    const naPrincipal = await prisma.categoriaFinanceira.count({ where: { empresaId: "" } });
    const r = await espelharEstrutura(b.id);
    expect(r.CategoriaFinanceira).toBe(naPrincipal);
    expect(await espelharEstrutura(b.id)).not.toHaveProperty("CategoriaFinanceira"); // de novo não duplica

    await naLoja(b.id, async () => {
      const cats = await prisma.categoriaFinanceira.findMany({ include: { pai: true } });
      expect(cats).toHaveLength(naPrincipal);
      expect(cats.every((c) => c.empresaId === b.id)).toBe(true);
      expect(cats.find((c) => c.nome === "T-Energia")!.pai!.empresaId).toBe(b.id);
      expect(await prisma.contaBancaria.count()).toBe(0); // banco é de cada CNPJ
      const svB = await prisma.situacaoVendaConfig.findUniqueOrThrow({ where: { empresaId_nome: { empresaId: LOJA_ATUAL, nome: "T-Concretizada" } } });
      expect(svB.id).not.toBe(sv.id);
      expect((await prisma.modeloMensagem.findUniqueOrThrow({ where: { id: svB.modeloMensagemId! } })).empresaId).toBe(b.id);
      // configuração copiada aponta para a situação da própria empresa; integração não vem
      const cfg = await prisma.configuracao.findUniqueOrThrow({ where: { chave: "contratos" } });
      expect(cfg.chave).toBe("contratos");
      expect((cfg.valor as { situacaoVendaId: string }).situacaoVendaId).toBe(svB.id);
      expect(await prisma.configuracao.findUnique({ where: { chave: "whatsapp" } })).toBeNull();

      // mudar aqui não mexe na principal
      await prisma.formaPagamento.update({ where: { empresaId_nome: { empresaId: LOJA_ATUAL, nome: "T-PIX" } }, data: { taxa: 1.5 } });
      await prisma.formaPagamento.create({ data: { nome: "T-Boleto SERVICE", tPag: "15" } });
      await prisma.configuracao.upsert({ where: { chave: "whatsapp" }, create: { chave: "whatsapp", valor: { token: "da-service" } }, update: {} });
    });

    await naLoja(a.id, async () => {
      expect((await prisma.formaPagamento.findMany({ where: { nome: { startsWith: "T-" } } })).map((f) => [f.nome, Number(f.taxa)])).toEqual([["T-PIX", 0]]);
      expect((await prisma.configuracao.findUniqueOrThrow({ where: { chave: "whatsapp" } })).valor).toEqual({ token: "segredo-da-mxtech" });
      const chaves = (await prisma.configuracao.findMany()).map((c) => c.chave);
      expect(chaves).toEqual(expect.arrayContaining(["contratos", "whatsapp"]));
      expect(chaves.some((c) => c.includes("#emp:"))).toBe(false);
    });
    await naLoja(b.id, async () => {
      expect((await prisma.configuracao.findUniqueOrThrow({ where: { chave: "whatsapp" } })).valor).toEqual({ token: "da-service" });
    });
  });

  it("clientes do grupo aparecem nas empresas marcadas; vazio = em todas", async () => {
    const { a, b } = await duasEmpresas();
    await prisma.pessoa.create({ data: { nome: "CLIENTE DO GRUPO", cliente: true } });
    await prisma.pessoa.create({ data: { nome: "SÓ DA MXTECH", cliente: true, documento: "11144477735", lojas: [a.id] } });
    const nomes = () => prisma.pessoa.findMany({ orderBy: { nome: "asc" } }).then((ps) => ps.map((p) => p.nome));
    expect(await naLoja(a.id, nomes)).toEqual(["CLIENTE DO GRUPO", "SÓ DA MXTECH"]);
    expect(await naLoja(b.id, nomes)).toEqual(["CLIENTE DO GRUPO"]);
    // pelo documento acha mesmo assim (não duplica o cadastro ao importar)
    expect(await naLoja(b.id, () => prisma.pessoa.findFirst({ where: { documento: "11144477735" } }))).not.toBeNull();
  });
});
