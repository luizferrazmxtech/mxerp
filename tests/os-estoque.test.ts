import { beforeAll, beforeEach, describe, expect, it } from "vitest";
import { execSync } from "node:child_process";

const URL = "postgresql://mxerp:mxerp@localhost:5432/mxerp_test?schema=public";
process.env.DATABASE_URL = URL;

const { prisma } = await import("@/lib/db");
const est = await import("@/lib/estoque/estoque");
const os = await import("@/lib/os/os");

let cliente: string, prod: string, locA: string, locB: string;

beforeAll(() => {
  execSync("npx prisma migrate deploy", {
    env: { ...process.env, DATABASE_URL: URL },
    stdio: "ignore",
  });
});

beforeEach(async () => {
  await prisma.$executeRawUnsafe(`TRUNCATE "Reserva","MovimentoEstoque","Saldo","OsItemProduto","OsItemServico","OsHistorico","OrdemServico","Produto","Local","Deposito","Pessoa","Sequencia" CASCADE`);
  const dep = await prisma.deposito.create({ data: { nome: "Loja" } });
  locA = (await prisma.local.create({ data: { depositoId: dep.id, codigo: "A-01", corredor: "A", prateleira: "01" } })).id;
  locB = (await prisma.local.create({ data: { depositoId: dep.id, codigo: "B-02", corredor: "B", prateleira: "02" } })).id;
  prod = (await prisma.produto.create({ data: { codigo: "SW8", nome: "Switch 8p", precoVenda: 499, localPadraoId: locA } })).id;
  cliente = (await prisma.pessoa.create({ data: { nome: "Condomínio Teste" } })).id;
  await prisma.$transaction(async (tx) => {
    await est.entrada(tx, { produtoId: prod, localId: locA, quantidade: 2, origemTipo: "IMPLANTACAO" });
    await est.entrada(tx, { produtoId: prod, localId: locB, quantidade: 3, origemTipo: "IMPLANTACAO" });
  });
});

const resumo = () => prisma.$transaction((tx) => est.resumoProduto(tx, prod));

describe("OS reserva estoque", () => {
  it("adicionar produto reserva e diz de qual prateleira pegar", async () => {
    const o = await os.criarOs({ clienteId: cliente });
    const { alocacoes } = await os.adicionarProduto(o.id, { produtoId: prod, quantidade: 3 });
    expect(alocacoes).toEqual([
      { localId: locA, quantidade: 2 },
      { localId: locB, quantidade: 1 },
    ]);
    expect(await resumo()).toEqual({ fisico: 5, reservado: 3, falta: 0, disponivel: 2, nosCarros: 0 });
  });

  it("segunda OS não consegue pegar o que já está reservado", async () => {
    const o1 = await os.criarOs({ clienteId: cliente });
    const o2 = await os.criarOs({ clienteId: cliente });
    await os.adicionarProduto(o1.id, { produtoId: prod, quantidade: 4 });
    const { alocacoes } = await os.adicionarProduto(o2.id, { produtoId: prod, quantidade: 3 });
    expect(alocacoes).toEqual([
      { localId: locB, quantidade: 1 },
      { localId: null, quantidade: 2 },
    ]);
    expect(await resumo()).toMatchObject({ reservado: 5, falta: 2, disponivel: 0 });
  });

  it("reservas simultâneas nunca passam do físico", async () => {
    const oss = await Promise.all([1, 2, 3, 4, 5].map(() => os.criarOs({ clienteId: cliente })));
    await Promise.all(oss.map((o) => os.adicionarProduto(o.id, { produtoId: prod, quantidade: 2 })));
    expect(await resumo()).toMatchObject({ fisico: 5, reservado: 5, falta: 5, disponivel: 0 });
  });

  it("concluir baixa das prateleiras reservadas; cancelar depois devolve", async () => {
    const o = await os.criarOs({ clienteId: cliente });
    await os.adicionarProduto(o.id, { produtoId: prod, quantidade: 3 });
    await os.alterarSituacao(o.id, "CONCLUIDA");
    expect(await resumo()).toEqual({ fisico: 2, reservado: 0, falta: 0, disponivel: 2, nosCarros: 0 });
    const saldoA = await prisma.saldo.findUnique({ where: { produtoId_localId: { produtoId: prod, localId: locA } } });
    expect(Number(saldoA!.quantidade)).toBe(0);
    await os.alterarSituacao(o.id, "CANCELADA");
    expect(await resumo()).toEqual({ fisico: 5, reservado: 0, falta: 0, disponivel: 5, nosCarros: 0 });
  });

  it("reabrir OS concluída estorna e reserva de novo", async () => {
    const o = await os.criarOs({ clienteId: cliente });
    await os.adicionarProduto(o.id, { produtoId: prod, quantidade: 2 });
    await os.alterarSituacao(o.id, "CONCLUIDA");
    await os.alterarSituacao(o.id, "EM_ANDAMENTO");
    expect(await resumo()).toEqual({ fisico: 5, reservado: 2, falta: 0, disponivel: 3, nosCarros: 0 });
    await os.alterarSituacao(o.id, "CONCLUIDA");
    await os.alterarSituacao(o.id, "EM_ANDAMENTO");
    expect(await resumo()).toEqual({ fisico: 5, reservado: 2, falta: 0, disponivel: 3, nosCarros: 0 });
  });

  it("cancelar libera e a peça vai para a OS que estava em falta", async () => {
    const o1 = await os.criarOs({ clienteId: cliente });
    const o2 = await os.criarOs({ clienteId: cliente });
    await os.adicionarProduto(o1.id, { produtoId: prod, quantidade: 5 });
    await os.adicionarProduto(o2.id, { produtoId: prod, quantidade: 2 });
    await os.alterarSituacao(o1.id, "CANCELADA");
    const r2 = await prisma.reserva.findMany({ where: { origemId: o2.id, status: "ATIVA" } });
    expect(r2.every((r) => r.localId !== null)).toBe(true);
    expect(await resumo()).toMatchObject({ reservado: 2, falta: 0, disponivel: 3 });
  });

  it("entrada de mercadoria cobre falta automaticamente", async () => {
    const o = await os.criarOs({ clienteId: cliente });
    await os.adicionarProduto(o.id, { produtoId: prod, quantidade: 7 });
    expect(await resumo()).toMatchObject({ falta: 2 });
    await prisma.$transaction((tx) => est.entrada(tx, { produtoId: prod, localId: locB, quantidade: 2, origemTipo: "COMPRA" }));
    expect(await resumo()).toMatchObject({ reservado: 7, falta: 0 });
  });

  it("não deixa concluir com falta, a menos que confirme negativo", async () => {
    const o = await os.criarOs({ clienteId: cliente });
    await os.adicionarProduto(o.id, { produtoId: prod, quantidade: 6 });
    await expect(os.alterarSituacao(o.id, "CONCLUIDA")).rejects.toThrow(/Sem estoque/);
    await os.alterarSituacao(o.id, "CONCLUIDA", { permitirNegativo: true });
    expect((await resumo()).fisico).toBe(-1);
  });

  it("alterar quantidade e remover item ajustam a reserva", async () => {
    const o = await os.criarOs({ clienteId: cliente });
    const { item } = await os.adicionarProduto(o.id, { produtoId: prod, quantidade: 1 });
    await os.alterarQuantidade(o.id, item.id, 4);
    expect(await resumo()).toMatchObject({ reservado: 4 });
    await os.removerProduto(o.id, item.id);
    expect(await resumo()).toMatchObject({ reservado: 0, disponivel: 5 });
    const atual = await prisma.ordemServico.findUniqueOrThrow({ where: { id: o.id } });
    expect(Number(atual.total)).toBe(0);
  });

  it("transferência leva a reserva junto", async () => {
    const o = await os.criarOs({ clienteId: cliente });
    await os.adicionarProduto(o.id, { produtoId: prod, quantidade: 2 }); // A-01
    await prisma.$transaction((tx) => est.transferir(tx, { produtoId: prod, deLocalId: locA, paraLocalId: locB, quantidade: 2 }));
    const sep = await os.listaSeparacao(o.id);
    expect(sep.map((s) => [s.local?.codigo, Number(s.quantidade)])).toEqual([["B-02", 2]]);
  });
});
