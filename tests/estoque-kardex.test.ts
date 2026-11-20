import { beforeAll, beforeEach, describe, expect, it } from "vitest";
import { execSync } from "node:child_process";

const URL = "postgresql://mxerp:mxerp@localhost:5432/mxerp_test?schema=public";
process.env.DATABASE_URL = URL;

const { prisma } = await import("@/lib/db");
const est = await import("@/lib/estoque/estoque");
const { whereProdutos } = await import("@/lib/itens/filtros");
const { documentosDosMovimentos, documentoDe } = await import("@/lib/estoque/origens");

beforeAll(() => {
  execSync("npx prisma migrate deploy", { env: { ...process.env, DATABASE_URL: URL }, stdio: "ignore" });
});

beforeEach(async () => {
  await prisma.$executeRawUnsafe(`TRUNCATE "Lancamento","VendaItem","Venda","OrdemServico","Reserva","MovimentoEstoque","Saldo","Produto","Local","Deposito","Pessoa" CASCADE`);
});

describe("lista de produtos e kardex", () => {
  it("a busca da lista de produtos exige todas as palavras, em qualquer ordem e sem acento", async () => {
    await prisma.produto.create({ data: { codigo: "4568020", nome: "INF - CONECTOR RJ45 CAT5E CONEX 1000 INTELBRAS", precoVenda: 2.9 } });
    await prisma.produto.create({ data: { codigo: "X1", nome: "Conector RJ11", precoVenda: 1 } });
    await prisma.produto.create({ data: { codigo: "X2", nome: "Câmera bullet", precoVenda: 1, gtin: "7896637699914" } });
    const nomes = async (q: string) => (await prisma.produto.findMany({ where: await whereProdutos({ q }), orderBy: { nome: "asc" } })).map((p) => p.nome);
    expect(await nomes("conector rj45 1000")).toEqual(["INF - CONECTOR RJ45 CAT5E CONEX 1000 INTELBRAS"]);
    expect(await nomes("1000 conector")).toEqual(["INF - CONECTOR RJ45 CAT5E CONEX 1000 INTELBRAS"]);
    expect(await nomes("conector")).toHaveLength(2);
    expect(await nomes("camera")).toEqual(["Câmera bullet"]);
    expect(await nomes("7896637699914")).toEqual(["Câmera bullet"]);
    expect(await nomes("conector camera")).toEqual([]);
  });

  it("o kardex mostra a venda e a OS de cada movimento, com link e cliente", async () => {
    const dep = await prisma.deposito.create({ data: { nome: "Loja" } });
    const loc = await prisma.local.create({ data: { depositoId: dep.id, codigo: "A-01" } });
    const p = await prisma.produto.create({ data: { codigo: "C1", nome: "Conector", precoVenda: 3 } });
    const cli = await prisma.pessoa.create({ data: { nome: "LUIZ FERRAZ", cliente: true } });
    const v = await prisma.venda.create({ data: { numero: 8698, clienteId: cli.id, data: new Date(), canal: "Presencial" } });
    const os = await prisma.ordemServico.create({ data: { numero: 6444, clienteId: cli.id, entrada: new Date(), canal: "Presencial" } });
    await prisma.$transaction(async (tx) => {
      await est.entrada(tx, { produtoId: p.id, localId: loc.id, quantidade: 10, origemTipo: "IMPLANTACAO", observacao: "OS 6444: peça já baixada no Gestão Click" });
      await est.saida(tx, { produtoId: p.id, localId: loc.id, quantidade: 2, origemTipo: "VENDA", origemId: v.id });
      await est.saida(tx, { produtoId: p.id, localId: loc.id, quantidade: 1, origemTipo: "OS", origemId: os.id });
    });
    const movs = await prisma.movimentoEstoque.findMany({ where: { produtoId: p.id } });
    const docs = await documentosDosMovimentos(movs);
    const de = (t: string) => documentoDe(docs, movs.find((m) => m.origemTipo === t)!);
    expect(de("VENDA")).toEqual({ rotulo: "Venda #8698", href: `/vendas/${v.id}`, pessoa: "LUIZ FERRAZ" });
    expect(de("OS")).toMatchObject({ rotulo: "OS #6444", href: `/os/${os.id}` });
    expect(de("IMPLANTACAO")).toMatchObject({ rotulo: "OS #6444", href: `/os/${os.id}` });
  });
});
