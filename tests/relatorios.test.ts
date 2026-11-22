import { beforeAll, beforeEach, describe, expect, it } from "vitest";
import { execSync } from "node:child_process";

const URL = "postgresql://mxerp:mxerp@localhost:5432/mxerp_test?schema=public";
process.env.DATABASE_URL = URL;

const { prisma } = await import("@/lib/db");
const rel = await import("@/lib/relatorios/relatorios");
const painel = await import("@/lib/relatorios/painel");
const loja = await import("@/lib/empresa/loja");
const { garantirPadroes, categoria } = await import("@/lib/financeiro/padroes");

const per = { de: new Date("2026-10-01T00:00:00Z"), ate: new Date("2026-10-31T00:00:00Z") };
let cli: string, cli2: string, vend: string, tec: string, pA: string, pB: string, sv: string;

beforeAll(() => execSync("npx prisma migrate deploy", { env: { ...process.env, DATABASE_URL: URL }, stdio: "ignore" }));

beforeEach(async () => {
  await prisma.$executeRawUnsafe(`TRUNCATE "Lancamento","VendaItem","VendaItemServico","Venda","OsItemProduto","OsItemServico","OsHistorico","OrdemServico","Produto","Servico","Pessoa","Usuario","CategoriaFinanceira","FormaPagamento","ContaBancaria" CASCADE`);
  cli = (await prisma.pessoa.create({ data: { nome: "Condomínio Azul" } })).id;
  cli2 = (await prisma.pessoa.create({ data: { nome: "Padaria" } })).id;
  vend = (await prisma.usuario.create({ data: { nome: "Ana Vendas", vendedor: true, comissao: 5, liberacaoComissao: "PARCIAL" } })).id;
  tec = (await prisma.usuario.create({ data: { nome: "Bruno Técnico", tecnico: true, comissao: 10, liberacaoComissao: "ULTIMA_PARCELA" } })).id;
  pA = (await prisma.produto.create({ data: { codigo: "CAM", nome: "Câmera", precoVenda: 300 } })).id;
  pB = (await prisma.produto.create({ data: { codigo: "CABO", nome: "Cabo", precoVenda: 10 } })).id;
  sv = (await prisma.servico.create({ data: { codigo: "INST", nome: "Instalação", preco: 200 } })).id;
  await prisma.$transaction((tx) => garantirPadroes(tx));
});

async function dados() {
  // venda: 2 câmeras (custo 150) + 10 cabos (custo 4) = 700, desconto geral 70 (10%)
  const v = await prisma.venda.create({ data: { numero: 1, clienteId: cli, vendedorId: vend, situacao: "CONCLUIDA", data: new Date("2026-10-05T15:00:00Z"), desconto: 70, total: 630,
    itens: { create: [{ produtoId: pA, quantidade: 2, valorUnit: 300, custoUnit: 150, subtotal: 600 }, { produtoId: pB, quantidade: 10, valorUnit: 10, custoUnit: 4, subtotal: 100 }] } } });
  // venda cancelada não entra
  await prisma.venda.create({ data: { numero: 2, clienteId: cli2, situacao: "CANCELADA", data: new Date("2026-10-06T15:00:00Z"), total: 300, itens: { create: [{ produtoId: pA, quantidade: 1, valorUnit: 300, custoUnit: 150, subtotal: 300 }] } } });
  // OS do técnico (sem vendedor): 1 câmera + instalação = 500
  const o = await prisma.ordemServico.create({ data: { numero: 10, clienteId: cli2, tecnicoId: tec, situacao: "CONCLUIDA", entrada: new Date("2026-10-10T12:00:00Z"), saida: new Date("2026-10-12T12:00:00Z"), previsao: new Date("2026-10-11T12:00:00Z"), total: 500,
    produtos: { create: [{ produtoId: pA, quantidade: 1, valorUnit: 300, custoUnit: 150, subtotal: 300 }] }, servicos: { create: [{ servicoId: sv, valorUnit: 200, subtotal: 200 }] },
    historico: { create: [
      { descricao: "aberta", situacao: "Em aberto", createdAt: new Date("2026-10-10T12:00:00Z") },
      { descricao: "andamento", situacao: "Em andamento", createdAt: new Date("2026-10-11T00:00:00Z") },
      { descricao: "concluída", situacao: "Concluída", createdAt: new Date("2026-10-12T12:00:00Z") },
    ] } } });
  const cat = await prisma.$transaction((tx) => categoria(tx, "Venda de produtos", "RECEBER"));
  const l = (origemTipo: "VENDA" | "OS", origemId: string, parcela: number, valor: number, pago: boolean) =>
    prisma.lancamento.create({ data: { tipo: "RECEBER", descricao: "x", categoriaId: cat.id, valor, vencimento: new Date("2026-10-30T00:00:00Z"), competencia: new Date("2026-10-05T00:00:00Z"), parcela, totalParcelas: 2, origemTipo, origemId, pagoEm: pago ? new Date("2026-10-30T00:00:00Z") : null, valorPago: pago ? valor : null } });
  await l("VENDA", v.id, 1, 315, true); await l("VENDA", v.id, 2, 315, false);
  await l("OS", o.id, 1, 250, true); await l("OS", o.id, 2, 250, false);
  return { v, o };
}

describe("relatórios", () => {
  it("lucro com desconto geral rateado, por documento e por produto", async () => {
    await dados();
    const r = await rel.relatorioLucro(per, "documento");
    expect(r.totais).toMatchObject({ documentos: 2, receita: 1130, custo: 490, lucro: 640, produtos: 930, servicos: 200 });
    expect(r.linhas.map((l) => [l.rotulo, l.receita, l.custo])).toEqual([["Venda nº 1", 630, 340], ["OS nº 10", 500, 150]]);
    // a OS 10 tinha previsão para 11/10 e saiu em 12/10: um dia depois; a venda não tem prazo
    expect(r.linhas.map((l) => l.prazo)).toEqual([undefined, { base: "previsao", dias: 1, concluida: true }]);
    expect(r.prazo).toEqual({ os: 1, atrasadas: 1, mediaDias: 1, maiorDias: 1 });
    const p = await rel.relatorioLucro(per, "produto");
    expect(p.linhas[0]).toMatchObject({ rotulo: "Câmera", quantidade: 3, receita: 840, custo: 450, documentos: 2 });
    const c = await rel.relatorioLucro(per, "cliente");
    expect(c.linhas.map((l) => l.rotulo)).toEqual(["Condomínio Azul", "Padaria"]);
  });

  it("curva ABC classifica pelo critério escolhido", async () => {
    await dados();
    const v = await rel.curvaAbc(per, "produtos", "valor");
    expect(v.linhas.map((l) => [l.rotulo, l.classe])).toEqual([["Câmera", "A"], ["Cabo", "B"]]);
    const q = await rel.curvaAbc(per, "produtos", "quantidade");
    expect(q.linhas[0].rotulo).toBe("Cabo");
    expect(rel.classificarAbc([{ base: 50 }, { base: 30 }, { base: 10 }, { base: 6 }, { base: 4 }]).map((l) => l.classe)).toEqual(["A", "A", "B", "B", "C"]);
  });

  it("comissões: proporcional ao recebido e integral só na última parcela", async () => {
    await dados();
    const r = await rel.relatorioComissoes(per);
    const ana = r.find((f) => f.nome === "Ana Vendas")!;
    expect(ana).toMatchObject({ base: 630, comissao: 31.5, liberada: 15.75 });
    const bruno = r.find((f) => f.nome === "Bruno Técnico")!;
    expect(bruno).toMatchObject({ base: 500, comissao: 50, liberada: 0 });
    await prisma.lancamento.updateMany({ where: { origemTipo: "OS" }, data: { pagoEm: new Date("2026-10-31T00:00:00Z") } });
    expect((await rel.relatorioComissoes(per)).find((f) => f.nome === "Bruno Técnico")!.liberada).toBe(50);
  });

  it("tempo das OS por situação e técnico", async () => {
    await dados();
    const r = await rel.tempoOs(per);
    expect(r.resumo).toMatchObject({ os: 1, mediaHoras: 48, atrasadas: 1 });
    expect(r.situacoes.map((s) => [s.situacao, s.horas])).toEqual([["Em andamento", 36], ["Em aberto", 12]]);
    expect(r.tecnicos[0]).toMatchObject({ tecnico: "Bruno Técnico", os: 1 });
    expect(rel.duracao(50.5)).toBe("2 d 2 h");
  });

  it("filtra por vendedor e pela loja do contexto", async () => {
    const { v } = await dados();
    expect((await rel.relatorioLucro(per, "documento", { vendedorId: vend })).totais).toMatchObject({ documentos: 1, receita: 630 });
    expect((await rel.curvaAbc(per, "clientes", "valor", { vendedorId: vend })).linhas.map((l) => l.rotulo)).toEqual(["Condomínio Azul"]);
    await prisma.$executeRawUnsafe(`TRUNCATE "Empresa" CASCADE`);
    const a = (await prisma.empresa.create({ data: { razaoSocial: "LOJA A", cnpj: "12345678000195" } })).id;
    const b = (await prisma.empresa.create({ data: { razaoSocial: "LOJA B", cnpj: "98765432000110" } })).id;
    loja.limparCacheLojas();
    await prisma.venda.update({ where: { id: v.id }, data: { empresaId: b } });
    // a OS sem loja aparece em todas; a venda da loja B não aparece na A
    const na = await loja.naLoja(a, () => rel.relatorioLucro(per, "documento"));
    expect(na.linhas.map((l) => l.rotulo)).toEqual(["OS nº 10"]);
    const nb = await loja.naLoja(b, () => rel.relatorioLucro(per, "documento"));
    expect(nb.totais.receita).toBe(1130);
    await prisma.$executeRawUnsafe(`TRUNCATE "Empresa" CASCADE`);
    loja.limparCacheLojas();
  });

  it("painel: período anterior, 12 meses com ano anterior e maiores clientes", async () => {
    await dados();
    // venda de setembro (período anterior) e de outubro do ano passado
    await prisma.venda.create({ data: { numero: 3, clienteId: cli2, vendedorId: vend, situacao: "CONCLUIDA", data: new Date("2026-09-15T15:00:00Z"), total: 100, itens: { create: [{ produtoId: pB, quantidade: 10, valorUnit: 10, custoUnit: 4, subtotal: 100 }] } } });
    await prisma.venda.create({ data: { numero: 4, clienteId: cli, situacao: "CONCLUIDA", data: new Date("2025-10-15T15:00:00Z"), total: 400, itens: { create: [{ produtoId: pB, quantidade: 40, valorUnit: 10, custoUnit: 4, subtotal: 400 }] } } });
    expect(painel.periodoAnterior(per)).toEqual({ de: new Date("2026-09-01T00:00:00Z"), ate: new Date("2026-09-30T00:00:00Z") });
    expect(painel.periodoAnterior({ de: new Date("2026-10-10T00:00:00Z"), ate: new Date("2026-10-19T00:00:00Z") })).toEqual({ de: new Date("2026-09-30T00:00:00Z"), ate: new Date("2026-10-09T00:00:00Z") });
    const d = await painel.painelRelatorios(per, {}, new Date("2026-11-21T00:00:00Z"));
    expect(d.atual).toMatchObject({ receita: 1130, lucro: 640, documentos: 2, vendas: 630, os: 500 });
    expect(d.anterior).toMatchObject({ receita: 100, documentos: 1 });
    expect(painel.variacao(d.atual.receita, d.anterior.receita)).toBeCloseTo(10.3);
    expect(d.mensal).toHaveLength(12);
    expect(d.mensal.at(-1)!.chave).toBe("2026-10");
    expect(d.mensal.at(-1)).toMatchObject({ receita: 1130, anoAnterior: 400 });
    expect(d.mensal.at(-2)).toMatchObject({ chave: "2026-09", receita: 100, anoAnterior: 0 });
    expect(d.clientes.top.map((c) => [c.rotulo, c.receita])).toEqual([["Condomínio Azul", 630], ["Padaria", 500]]);
    expect(d.servicos.top.map((c) => c.rotulo)).toEqual(["Instalação"]);
    expect(d.vendedores.map((x) => x.nome)).toEqual(["Ana Vendas"]);
    expect(painel.variacao(5, 0)).toBeNull();
  });

  it("evolução do lucro: por dia no mês e por mês em períodos longos", async () => {
    await dados();
    const r = await rel.relatorioLucro(per, "documento");
    expect(r.evolucao.porDia).toBe(true);
    expect(r.evolucao.pontos).toHaveLength(31);
    expect(r.evolucao.pontos.find((p) => p.chave === "2026-10-05")).toMatchObject({ receita: 630, lucro: 290 });
    expect(r.evolucao.pontos.find((p) => p.chave === "2026-10-12")).toMatchObject({ receita: 500, lucro: 350 });
    const ano = await rel.relatorioLucro({ de: new Date("2022-01-01T00:00:00Z"), ate: new Date("2026-11-30T00:00:00Z") }, "cliente");
    expect(ano.evolucao.porDia).toBe(false);
    expect(ano.evolucao.pontos.map((p) => p.chave)).toEqual(["2026-10", "2026-11"]);
    expect(ano.evolucao.pontos[0].receita).toBe(1130);
  });
});
