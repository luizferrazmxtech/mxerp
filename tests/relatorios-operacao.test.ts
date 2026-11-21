import { beforeAll, beforeEach, describe, expect, it } from "vitest";
import { execSync } from "node:child_process";

const URL = "postgresql://mxerp:mxerp@localhost:5432/mxerp_test?schema=public";
process.env.DATABASE_URL = URL;

const { prisma } = await import("@/lib/db");
const op = await import("@/lib/relatorios/operacao");

const d = (s: string) => new Date(`${s}T15:00:00Z`);
const hoje = new Date("2026-11-21T00:00:00Z");
const outubro = { de: new Date("2026-10-01T00:00:00Z"), ate: new Date("2026-10-31T00:00:00Z") };
let ana: string, bia: string, novo: string, tec: string, cam: string, cabo: string, sv: string, local: string;

beforeAll(() => execSync("npx prisma migrate deploy", { env: { ...process.env, DATABASE_URL: URL }, stdio: "ignore" }));

beforeEach(async () => {
  await prisma.$executeRawUnsafe(`TRUNCATE "VendaItem","VendaItemServico","Venda","OsItemProduto","OsItemServico","OsEquipamento","OsHistorico","OrdemServico","MovimentoEstoque","Saldo","Reserva","Local","Deposito","Produto","Servico","Pessoa","Usuario" CASCADE`);
  ana = (await prisma.pessoa.create({ data: { nome: "Ana" } })).id;
  bia = (await prisma.pessoa.create({ data: { nome: "Bia" } })).id;
  novo = (await prisma.pessoa.create({ data: { nome: "Cliente novo" } })).id;
  tec = (await prisma.usuario.create({ data: { nome: "Bruno Técnico", tecnico: true } })).id;
  cam = (await prisma.produto.create({ data: { codigo: "CAM", nome: "Câmera", precoVenda: 300, custo: 150, createdAt: d("2026-01-01") } })).id;
  cabo = (await prisma.produto.create({ data: { codigo: "CABO", nome: "Cabo", precoVenda: 10, custo: 4, createdAt: d("2026-01-01") } })).id;
  sv = (await prisma.servico.create({ data: { codigo: "INST", nome: "Instalação", preco: 200 } })).id;
  const dep = await prisma.deposito.create({ data: { nome: "Loja" } });
  local = (await prisma.local.create({ data: { depositoId: dep.id, codigo: "LOJA" } })).id;
});

const venda = (n: number, clienteId: string, dia: string, valor: number, canal = "Presencial", tipo: "PEDIDO" | "BALCAO" = "PEDIDO") =>
  prisma.venda.create({ data: { numero: n, clienteId, situacao: "CONCLUIDA", data: d(dia), canal, tipo, total: valor,
    itens: { create: [{ produtoId: cabo, quantidade: valor / 10, valorUnit: 10, custoUnit: 4, subtotal: valor }] } } });

describe("operação e clientes", () => {
  it("faturamento por canal e por tipo", async () => {
    await venda(1, ana, "2026-10-05", 100, "Presencial", "BALCAO");
    await venda(2, bia, "2026-10-06", 300, "Mercado Livre");
    await venda(3, bia, "2026-10-07", 50, "Mercado Livre");
    const r = await op.vendasPorCanal(outubro);
    expect(r.total).toBe(450);
    expect(r.canais.map((c) => [c.chave, c.receita, c.documentos])).toEqual([["Mercado Livre", 350, 2], ["Presencial", 100, 1]]);
    expect(r.tipos.map((t) => [t.rotulo, t.receita])).toEqual([["Pedido de venda", 350], ["Balcão (PDV)", 100]]);
  });

  it("OS por técnico (serviços e peças) e por equipamento", async () => {
    const os = (n: number, equipamento: string, situacao: "CONCLUIDA" | "ABERTA" | "CANCELADA") =>
      prisma.ordemServico.create({ data: { numero: n, clienteId: ana, tecnicoId: tec, situacao, entrada: d("2026-10-10"), saida: situacao === "CONCLUIDA" ? d("2026-10-12") : null, total: 500,
        equipamentos: { create: [{ equipamento }] },
        produtos: { create: [{ produtoId: cam, quantidade: 1, valorUnit: 300, custoUnit: 150, subtotal: 300 }] }, servicos: { create: [{ servicoId: sv, valorUnit: 200, subtotal: 200 }] } } });
    await os(1, "Notebook", "CONCLUIDA");
    await os(2, " notebook ", "ABERTA");
    await os(3, "Câmera IP", "CONCLUIDA");
    await os(4, "Notebook", "CANCELADA");
    const r = await op.osPorTecnicoEEquipamento(outubro);
    expect(r.tecnicos).toEqual([{ chave: tec, nome: "Bruno Técnico", os: 2, receita: 1000, servicos: 400, ticket: 500 }]);
    expect(r.equipamentos.map((e) => [e.equipamento, e.os, e.concluidas])).toEqual([["Notebook", 2, 1], ["Câmera IP", 1, 1]]);
  });

  it("estoque parado: com saldo e sem saída há mais de 90 dias", async () => {
    await prisma.saldo.create({ data: { produtoId: cam, localId: local, quantidade: 4 } });
    await prisma.saldo.create({ data: { produtoId: cabo, localId: local, quantidade: 100 } });
    await prisma.movimentoEstoque.create({ data: { produtoId: cam, localId: local, tipo: "SAIDA", quantidade: 1, origemTipo: "VENDA", createdAt: d("2026-05-01") } });
    await prisma.movimentoEstoque.create({ data: { produtoId: cabo, localId: local, tipo: "SAIDA", quantidade: 1, origemTipo: "VENDA", createdAt: d("2026-11-01") } });
    const r = await op.estoqueParado(90, hoje);
    expect(r.valorEstoque).toBe(1000); // 4×150 + 100×4
    expect(r.parados.map((p) => [p.nome, p.valor, p.dias])).toEqual([["Câmera", 600, 203]]);
    expect(r.valorParado).toBe(600);
  });

  it("clientes novos × recorrentes e quem parou de comprar", async () => {
    await venda(1, ana, "2026-03-10", 100);
    await venda(2, ana, "2026-07-10", 100); // Ana: 2 compras, última há mais de 90 dias → sumiu
    await venda(3, bia, "2025-01-10", 100);
    await venda(4, bia, "2026-11-05", 100); // Bia: recorrente em novembro
    await venda(5, novo, "2026-11-06", 100); // novo em novembro
    await venda(6, novo, "2026-11-08", 100);
    const r = await op.clientesNovosERecorrentes(hoje);
    expect(r.meses).toHaveLength(12);
    expect(r.meses.at(-1)).toMatchObject({ mes: "2026-11", novos: 1, recorrentes: 1 });
    expect(r.meses.find((m) => m.mes === "2026-03")).toMatchObject({ novos: 1, recorrentes: 0 });
    expect(r.meses.find((m) => m.mes === "2026-07")).toMatchObject({ novos: 0, recorrentes: 1 });
    expect(r.sumiram.map((c) => [c.nome, c.compras, c.total])).toEqual([["Ana", 2, 200]]);
    expect(r.ativos).toBe(2);
  });
});
