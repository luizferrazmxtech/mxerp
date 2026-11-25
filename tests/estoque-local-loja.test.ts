import { beforeAll, beforeEach, describe, expect, it } from "vitest";
import { execSync } from "node:child_process";

const URL = "postgresql://mxerp:mxerp@localhost:5432/mxerp_test?schema=public";
process.env.DATABASE_URL = URL;

const { prisma } = await import("@/lib/db");
const est = await import("@/lib/estoque/estoque");
const doc = await import("@/lib/estoque/documentos");
const { localDaLoja } = await import("@/lib/estoque/entrada");

/**
 * Venda, devolução, estorno e ajuste sem prateleira nunca caem no carro de uma equipe.
 * O carro tem código CARRO-… e a loja LOJA-…: pelo código, o carro vinha primeiro (bug das vendas de 23/11).
 */
let prod = "", loja = "", carro = "", equipe = "";
const u = { id: "", nome: "Escritório" };

beforeAll(() => execSync("npx prisma migrate deploy", { env: { ...process.env, DATABASE_URL: URL }, stdio: "ignore" }));

beforeEach(async () => {
  await prisma.$executeRawUnsafe(`TRUNCATE "AjusteEstoque","Reserva","MovimentoEstoque","Saldo","TransferenciaEstoque","Produto","Local","Deposito","Equipe","Sequencia" CASCADE`);
  await prisma.configuracao.deleteMany({ where: { chave: "estoque" } });
  const dep = await prisma.deposito.create({ data: { nome: "Loja" } });
  loja = (await prisma.local.create({ data: { depositoId: dep.id, codigo: "LOJA-01" } })).id;
  equipe = (await prisma.equipe.create({ data: { nome: "Beta" } })).id;
  const dc = await prisma.deposito.create({ data: { nome: "Carro - Beta", equipeId: equipe } });
  carro = (await prisma.local.create({ data: { depositoId: dc.id, codigo: "CARRO-BETA" } })).id;
  prod = (await prisma.produto.create({ data: { codigo: "00223", nome: "MicroSD", precoVenda: 50, custo: 30 } })).id;
  u.id = (await prisma.usuario.upsert({ where: { email: "esc@local-loja.test" }, update: {}, create: { nome: "Escritório", email: "esc@local-loja.test", papel: "GERENTE" } })).id;
});

const saldo = async (localId: string) => Number((await prisma.saldo.findUnique({ where: { produtoId_localId: { produtoId: prod, localId } } }))?.quantidade ?? 0);

describe("local da loja (nunca o carro)", () => {
  it("venda sem estoque baixada no negativo sai da loja, não do carro", async () => {
    await prisma.$transaction(async (tx) => {
      await est.reservarItem(tx, { origemTipo: "VENDA", origemId: "v1", origemItemId: "i1", produtoId: prod, quantidade: 1 });
      await est.baixarDocumento(tx, "VENDA", "v1", { permitirNegativo: true });
    });
    expect(await saldo(loja)).toBe(-1);
    expect(await saldo(carro)).toBe(0);
  });

  it("local padrão do produto no carro é ignorado: a venda baixa da loja", async () => {
    await prisma.produto.update({ where: { id: prod }, data: { localPadraoId: carro } });
    expect(await prisma.$transaction((tx) => localDaLoja(tx, carro))).toBe(loja);
    await prisma.$transaction(async (tx) => {
      await est.reservarItem(tx, { origemTipo: "VENDA", origemId: "v2", origemItemId: "i2", produtoId: prod, quantidade: 2 });
      await est.baixarDocumento(tx, "VENDA", "v2", { permitirNegativo: true });
    });
    expect(await saldo(carro)).toBe(0);
    expect(await saldo(loja)).toBe(-2);
  });

  it("ajuste de entrada sem local entra na loja; ajuste de saída sem local não tira do carro", async () => {
    await doc.criarAjuste({ tipo: "ENTRADA", frete: "0", observacoes: "", itens: [{ produtoId: prod, quantidade: "3", custo: "30" }] }, u);
    expect(await saldo(loja)).toBe(3);
    expect(await saldo(carro)).toBe(0);
    await prisma.$transaction((tx) => est.entrada(tx, { produtoId: prod, localId: carro, quantidade: 5, origemTipo: "TRANSFERENCIA" }));
    await doc.criarAjuste({ tipo: "SAIDA", frete: "0", observacoes: "", itens: [{ produtoId: prod, quantidade: "4", custo: "30" }] }, u);
    expect(await saldo(carro)).toBe(5);
    expect(await saldo(loja)).toBe(-1);
  });

  it("o estoque de entrada das configurações vale para o local da loja", async () => {
    const d2 = await prisma.deposito.create({ data: { nome: "Depósito 2" } });
    const l2 = (await prisma.local.create({ data: { depositoId: d2.id, codigo: "DEP2-01" } })).id;
    await prisma.configuracao.create({ data: { chave: "estoque", valor: { depositoEntrada: d2.id } } });
    expect(await prisma.$transaction((tx) => localDaLoja(tx))).toBe(l2);
  });
});
