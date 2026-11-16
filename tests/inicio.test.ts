import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { execSync } from "node:child_process";
import { abreviar, escalaEixo, melhorPior, percentual, saudacao } from "@/lib/inicio/escala";

const URL = "postgresql://mxerp:mxerp@localhost:5432/mxerp_test?schema=public";
process.env.DATABASE_URL = URL;

const { prisma } = await import("@/lib/db");
const { dadosPainel } = await import("@/lib/inicio/painel");
const { diaSP, somarDias } = await import("@/lib/datas");

describe("contas dos gráficos", () => {
  it("arredonda o topo do eixo", () => {
    expect(escalaEixo(0, 172000)).toMatchObject({ baixo: 0, alto: 200000, valores: [0, 50000, 100000, 150000, 200000] });
    expect(escalaEixo(-10000, 140000).baixo).toBe(-50000);
    expect(escalaEixo(0, 0).alto).toBeGreaterThan(0);
  });
  it("abrevia valores", () => {
    expect(abreviar(150000)).toBe("150k");
    expect(abreviar(1200000)).toBe("1,2mi");
    expect(abreviar(-0)).toBe("0");
  });
  it("percentual, melhor/pior mês e saudação", () => {
    expect(percentual(50, 200)).toBe(25);
    expect(percentual(10, 0)).toBe(0);
    expect(percentual(300, 200)).toBe(100);
    expect(melhorPior([{ rotulo: "a", v: 1 }, { rotulo: "b", v: 5 }, { rotulo: "c", v: -2 }], (x) => x.v)).toMatchObject({ melhor: { rotulo: "b" }, pior: { rotulo: "c" } });
    expect(saudacao(new Date("2026-11-16T12:00:00Z"))).toBe("Bom dia"); // 9h em SP
    expect(saudacao(new Date("2026-11-16T22:00:00Z"))).toBe("Boa noite"); // 19h em SP
  });
});

describe("dados da tela inicial", () => {
  let cliente: string, cat: string, conta: string;
  afterAll(async () => {
    // as situações padrão (da migração) ficam; só saem as criadas aqui
    await prisma.$executeRawUnsafe(`TRUNCATE "OrdemServico","Orcamento" CASCADE`);
    await prisma.situacaoOsConfig.deleteMany({ where: { nome: { startsWith: "T·" } } });
    await prisma.situacaoOrcamento.deleteMany({ where: { nome: { startsWith: "T·" } } });
  });
  beforeAll(() => {
    execSync("npx prisma migrate deploy", { env: { ...process.env, DATABASE_URL: URL }, stdio: "ignore" });
  });
  beforeEach(async () => {
    await prisma.$executeRawUnsafe(`TRUNCATE "OrdemServico","Orcamento" CASCADE`);
    await prisma.situacaoOsConfig.deleteMany({ where: { nome: { startsWith: "T·" } } });
    await prisma.situacaoOrcamento.deleteMany({ where: { nome: { startsWith: "T·" } } });
    await prisma.$executeRawUnsafe(`TRUNCATE "Lancamento","Venda","Reserva","Saldo","OrdemServico","Orcamento","Produto","Local","Deposito","Pessoa","CategoriaFinanceira","ContaBancaria" CASCADE`);
    cliente = (await prisma.pessoa.create({ data: { nome: "Cliente" } })).id;
    cat = (await prisma.categoriaFinanceira.create({ data: { nome: "Vendas", tipo: "RECEBER", grupoDre: "RECEITA_BRUTA" } })).id;
    conta = (await prisma.contaBancaria.create({ data: { nome: "Inter", saldoInicial: 1000 } })).id;
  });

  it("soma vendas, OS, financeiro, estoque e orçamentos", async () => {
    const hoje = diaSP();
    const agora = new Date();
    // vendas: concluída conta, aberta e cancelada não
    await prisma.venda.createMany({ data: [
      { numero: 1, situacao: "CONCLUIDA", total: 300, clienteId: cliente },
      { numero: 2, situacao: "ABERTA", total: 999, clienteId: cliente },
      { numero: 3, situacao: "CANCELADA", total: 999, clienteId: cliente },
    ] });
    const sAberta = await prisma.situacaoOsConfig.create({ data: { nome: "T·Em aberto", cor: "cinza", ordem: 0 } });
    const sOk = await prisma.situacaoOsConfig.create({ data: { nome: "T·Concretizada", cor: "verde", ordem: 1, estoque: "LANCAR", financeiro: true } });
    await prisma.ordemServico.createMany({ data: [
      { numero: 10, clienteId: cliente, situacao: "ABERTA", situacaoId: sAberta.id, total: 100, previsao: somarDias(agora, -2) },
      { numero: 11, clienteId: cliente, situacao: "ABERTA", situacaoId: sAberta.id, total: 50 },
      { numero: 12, clienteId: cliente, situacao: "FATURADA", situacaoId: sOk.id, total: 200, saida: agora },
    ] });
    // financeiro: um recebido hoje, um a receber hoje, um a pagar vencido
    await prisma.lancamento.createMany({ data: [
      { tipo: "RECEBER", descricao: "pago", categoriaId: cat, valor: 400, valorPago: 400, vencimento: hoje, competencia: hoje, pagoEm: hoje, contaBancariaId: conta },
      { tipo: "RECEBER", descricao: "hoje", categoriaId: cat, valor: 150, vencimento: hoje, competencia: hoje },
      { tipo: "PAGAR", descricao: "vencida", categoriaId: cat, valor: 80, vencimento: somarDias(hoje, -3), competencia: hoje },
    ] });
    // estoque: produto abaixo do mínimo e peça em falta
    const dep = await prisma.deposito.create({ data: { nome: "Loja" } });
    const loc = await prisma.local.create({ data: { depositoId: dep.id, codigo: "A" } });
    const p = await prisma.produto.create({ data: { codigo: "P1", nome: "Cabo", estoqueMinimo: 10 } });
    await prisma.saldo.create({ data: { produtoId: p.id, localId: loc.id, quantidade: 3 } });
    await prisma.reserva.create({ data: { produtoId: p.id, quantidade: 2, origemTipo: "OS", origemId: "os-x", origemItemId: "i" } });
    // orçamentos: um em aberto, um concretizado
    const sOrc = await prisma.situacaoOrcamento.create({ data: { nome: "T·Em aberto" } });
    const sFim = await prisma.situacaoOrcamento.create({ data: { nome: "T·Concretizado", geraVenda: true } });
    await prisma.orcamento.createMany({ data: [
      { numero: 1, clienteId: cliente, data: hoje, situacaoId: sOrc.id, total: 700 },
      { numero: 2, clienteId: cliente, data: hoje, situacaoId: sFim.id, total: 900 },
    ] });

    const d = await dadosPainel({ financeiro: true, vendas: true });
    const mes = d.vendas!.at(-1)!;
    expect(mes.vendas).toBe(300);
    expect(mes.os).toBe(200);
    expect(d.os.abertas).toBe(2);
    expect(d.os.atrasadas).toBe(1);
    expect(d.os.comFalta).toBe(1);
    expect(d.os.situacoes).toEqual([expect.objectContaining({ nome: "T·Em aberto", n: 2, total: 150 })]);
    expect(d.os.porMes.at(-1)).toMatchObject({ entradas: 3, concluidas: 1 });
    const f = d.financeiro!;
    expect(f.saldoTotal).toBe(1400);
    expect(f.receber).toMatchObject({ hoje: 150, nHoje: 1, mes: { feito: 400, previsto: 550 } });
    expect(f.pagar).toMatchObject({ vencido: 80, nVencido: 1 });
    expect(f.fluxo.at(-1)).toMatchObject({ recebimentos: 400, pagamentos: 0, saldo: 400 });
    expect(d.estoque.baixo).toEqual([expect.objectContaining({ codigo: "P1", saldo: 3, minimo: 10 })]);
    expect(d.estoque.falta).toEqual([expect.objectContaining({ codigo: "P1", falta: 2, docs: 1 })]);
    expect(d.orcamentos).toMatchObject({ n: 1, total: 700, n30: 1 });
  });

  it("não calcula financeiro nem vendas para quem não tem acesso", async () => {
    const d = await dadosPainel({ financeiro: false, vendas: false });
    expect(d.financeiro).toBeNull();
    expect(d.vendas).toBeNull();
    expect(d.os.abertas).toBe(0);
  });
});
