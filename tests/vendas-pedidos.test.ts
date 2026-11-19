import { beforeAll, beforeEach, describe, expect, it } from "vitest";
import { execSync } from "node:child_process";

const URL = "postgresql://mxerp:mxerp@localhost:5432/mxerp_test?schema=public";
process.env.DATABASE_URL = URL;

const { prisma } = await import("@/lib/db");
const est = await import("@/lib/estoque/estoque");
const ped = await import("@/lib/vendas/pedidos");
const { gerarParcelas } = await import("@/lib/orcamentos/orcamentos");
type Dados = import("@/lib/orcamentos/tipos").DadosOrcamento;

let prod = "", serv = "", cli = "", loc = "";
let u = { id: "", nome: "Caue", papel: "OPERADOR" as const };

beforeAll(() => {
  execSync("npx prisma migrate deploy", { env: { ...process.env, DATABASE_URL: URL }, stdio: "ignore" });
});

beforeEach(async () => {
  await prisma.$executeRawUnsafe(`TRUNCATE "Orcamento","Anotacao","Lancamento","VendaPagamento","VendaItem","Venda","OrdemServico","Reserva","MovimentoEstoque","Saldo","Produto","Servico","Local","Deposito","Pessoa","Sequencia" CASCADE`);
  // situações como a migração cria
  await prisma.situacaoVendaConfig.updateMany({ data: { bloqueados: [], permiteEdicao: true } });
  const dep = await prisma.deposito.create({ data: { nome: "Loja" } });
  loc = (await prisma.local.create({ data: { depositoId: dep.id, codigo: "A-01" } })).id;
  prod = (await prisma.produto.create({ data: { codigo: "NB", nome: "Nobreak 1500VA", precoVenda: 1240, custo: 800, localPadraoId: loc } })).id;
  serv = (await prisma.servico.create({ data: { codigo: "INST", nome: "Instalação", preco: 150 } })).id;
  cli = (await prisma.pessoa.create({ data: { nome: "Departamento de Engenharia", cliente: true } })).id;
  const usuario = await prisma.usuario.upsert({ where: { email: "ped@local.test" }, update: {}, create: { nome: "Caue", email: "ped@local.test", papel: "OPERADOR" } });
  u = { id: usuario.id, nome: usuario.nome, papel: "OPERADOR" };
  await prisma.$transaction((tx) => est.entrada(tx, { produtoId: prod, localId: loc, quantidade: 5, origemTipo: "IMPLANTACAO" }));
});

const estoque = () => prisma.$transaction((tx) => est.resumoProduto(tx, prod));
const recebiveis = (vendaId: string) => prisma.lancamento.findMany({ where: { origemTipo: "VENDA", origemId: vendaId }, orderBy: { parcela: "asc" } });

const dados = (m: Partial<Dados> = {}): Dados => ({
  tipo: "PRODUTO", numero: "", clienteId: cli, clienteNome: "", data: "2026-11-09", validade: "", vendedorId: "", prazoEntrega: "", aosCuidados: "",
  canal: "Presencial", centroCusto: "", introducao: "", situacaoId: "sv_aberto",
  produtos: [{ produtoId: prod, nome: "Nobreak", codigo: "NB", unidade: "UN", detalhes: "", quantidade: "2", tipoValorId: "", valorUnit: "100,00", desconto: "0", descontoPct: false }],
  servicos: [{ servicoId: serv, nome: "Instalação", codigo: "INST", detalhes: "", quantidade: "1", valorUnit: "150,00", desconto: "0", descontoPct: false }],
  transportadoraId: "", transportadoraNome: "", frete: "0", mostrarEntrega: false, enderecoEntregaId: "",
  desconto: "", descontoPct: false, exibirTotal: true,
  gerarCondicoes: true, condicao: "PARCELADO", formaPagamentoId: "", vencimento: "", intervaloDias: "30", numParcelas: "2", primeiraParcela: "2026-12-01",
  parcelas: gerarParcelas(350, 2, "2026-12-01", 30, ""),
  observacoes: "", observacaoInterna: "", camposExtras: {}, ...m,
});

describe("pedidos de venda (situações configuráveis)", () => {
  it("em aberto reserva; concretizada baixa e lança as parcelas pendentes; cancelada estorna e cancela o financeiro", async () => {
    await prisma.sequencia.create({ data: { chave: "VENDA", valor: 8694 } });
    const v = await ped.salvarPedido(dados(), u);
    expect(v.numero).toBe(8695);
    expect(v.situacao).toBe("ABERTA");
    expect(Number(v.totalProdutos)).toBe(200);
    expect(Number(v.totalServicos)).toBe(150);
    expect(await estoque()).toMatchObject({ fisico: 5, reservado: 2, disponivel: 3 });
    expect(await recebiveis(v.id)).toHaveLength(0);

    await ped.alterarSituacaoPedido(v.id, "sv_concretizada", u);
    expect(await estoque()).toMatchObject({ fisico: 3, reservado: 0 });
    const l = await recebiveis(v.id);
    expect(l.map((x) => Number(x.valor))).toEqual([175, 175]);
    expect(l.every((x) => !x.pagoEm)).toBe(true);
    const cat = await prisma.categoriaFinanceira.findUniqueOrThrow({ where: { id: l[0].categoriaId! } });
    expect(cat.nome).toBe("Venda de produtos");
    // venda única com peças e serviços: uma conta por parcela, rateada entre as duas receitas na DRE
    const rat = await prisma.lancamentoRateio.findMany({ where: { lancamentoId: l[0].id }, include: { categoria: true } });
    expect(Object.fromEntries(rat.map((r) => [r.categoria.nome, Number(r.fracao)]))).toEqual({ "Venda de produtos": 0.57142857, "Prestação de serviços": 0.42857143 });
    const { calcularDre } = await import("@/lib/financeiro/dre");
    const dre = await calcularDre(2026);
    const linha = (k: string) => dre.linhas.find((x) => x.chave === k)!;
    expect(linha("RECEITA_BRUTA:Venda de produtos").meses[10]).toBeCloseTo(200, 2);
    expect(linha("RECEITA_BRUTA:Prestação de serviços").meses[10]).toBeCloseTo(150, 2);

    await ped.alterarSituacaoPedido(v.id, "sv_cancelada", u);
    expect(await estoque()).toMatchObject({ fisico: 5, reservado: 0 });
    expect(await recebiveis(v.id)).toHaveLength(0);
    const h = await prisma.vendaHistorico.findMany({ where: { vendaId: v.id } });
    expect(h.length).toBeGreaterThanOrEqual(3);
  });

  it("editar os produtos refaz a reserva; só valores não mexe no estoque; situação sem edição trava", async () => {
    const v = await ped.salvarPedido(dados(), u);
    await ped.salvarPedido(dados({ produtos: [{ ...dados().produtos[0], quantidade: "4" }], condicao: "AVISTA", parcelas: [] }), u, v.id);
    expect(await estoque()).toMatchObject({ reservado: 4 });
    await ped.salvarPedido(dados({ produtos: [{ ...dados().produtos[0], quantidade: "4", valorUnit: "90,00" }], condicao: "AVISTA", parcelas: [] }), u, v.id);
    expect(await estoque()).toMatchObject({ reservado: 4, fisico: 5 });
    const atual = await prisma.venda.findUniqueOrThrow({ where: { id: v.id } });
    expect(Number(atual.total)).toBe(510);

    await prisma.situacaoVendaConfig.update({ where: { id: "sv_aberto" }, data: { permiteEdicao: false } });
    await expect(ped.salvarPedido(dados({ condicao: "AVISTA", parcelas: [] }), u, v.id)).rejects.toThrow(/não podem ser editadas/);
  });

  it("parcelas que não fecham com o total são recusadas", async () => {
    await expect(ped.salvarPedido(dados({ parcelas: gerarParcelas(300, 2, "2026-12-01", 30, "") }), u)).rejects.toThrow(/não fecha/);
  });

  it("troca devolve a peça e gera vale-compras; devolução gera conta a pagar; não devolve mais que o vendido", async () => {
    const v = await ped.salvarPedido(dados({ situacaoId: "sv_concretizada" }), u);
    expect(await estoque()).toMatchObject({ fisico: 3 });
    const item = (await prisma.vendaItem.findFirstOrThrow({ where: { vendaId: v.id } })).id;

    const troca = await ped.registrarDevolucao({ vendaId: v.id, tipo: "TROCA", itens: [{ vendaItemId: item, quantidade: 1 }] }, u);
    expect(Number(troca.total)).toBe(100);
    expect(await estoque()).toMatchObject({ fisico: 4 });
    const vale = await prisma.valeCompra.findUniqueOrThrow({ where: { devolucaoId: troca.id } });
    expect(Number(vale.saldo)).toBe(100);

    const dev = await ped.registrarDevolucao({ vendaId: v.id, tipo: "DEVOLUCAO", itens: [{ vendaItemId: item, quantidade: 1 }] }, u);
    const pagar = await prisma.lancamento.findFirstOrThrow({ where: { origemTipo: "DEVOLUCAO", origemId: dev.id } });
    expect(pagar.tipo).toBe("PAGAR");
    expect(Number(pagar.valor)).toBe(100);
    await expect(ped.registrarDevolucao({ vendaId: v.id, tipo: "DEVOLUCAO", itens: [{ vendaItemId: item, quantidade: 1 }] }, u)).rejects.toThrow(/Só restam 0/);
  });

  it("devolução exige venda concretizada", async () => {
    const v = await ped.salvarPedido(dados(), u);
    const item = (await prisma.vendaItem.findFirstOrThrow({ where: { vendaId: v.id } })).id;
    await expect(ped.registrarDevolucao({ vendaId: v.id, tipo: "TROCA", itens: [{ vendaItemId: item, quantidade: 1 }] }, u)).rejects.toThrow(/concretizada/);
  });

  it("venda migrada já concretizada (baixa feita no Gestão Click) devolve as peças ao ser cancelada", async () => {
    const v = await prisma.venda.create({
      data: {
        numero: 7000, idLegado: "venda:7000", clienteId: cli, situacaoId: "sv_concretizada", situacao: "CONCLUIDA", total: 200, totalProdutos: 200,
        itens: { create: [{ produtoId: prod, quantidade: 2, valorUnit: 100, subtotal: 200 }] },
      },
    });
    await ped.alterarSituacaoPedido(v.id, "sv_cancelada", u);
    expect(await estoque()).toMatchObject({ fisico: 7, reservado: 0 });
    // de volta para concretizada: agora a baixa é feita aqui
    await ped.alterarSituacaoPedido(v.id, "sv_concretizada", u);
    expect(await estoque()).toMatchObject({ fisico: 5 });
  });

  it("gerar cópia cria um novo pedido na situação padrão com os mesmos itens", async () => {
    const v = await ped.salvarPedido(dados({ situacaoId: "sv_concretizada" }), u);
    const c = await ped.clonarPedido(v.id, u);
    expect(c.numero).not.toBe(v.numero);
    expect(await prisma.vendaItem.count({ where: { vendaId: c.id } })).toBe(1);
    expect(await prisma.vendaItemServico.count({ where: { vendaId: c.id } })).toBe(1);
  });

  it("devolução de venda com peças e serviços leva só a parte do desconto da peça e sai do CMV da DRE", async () => {
    // 2 × 100 (peça) + 150 (serviço) − 35 de desconto = 315: a peça leva 35 × 200/350 = 20 → 90 por unidade
    const v = await ped.salvarPedido(dados({ situacaoId: "sv_concretizada", desconto: "35,00", condicao: "AVISTA", parcelas: [] }), u);
    const item = (await prisma.vendaItem.findFirstOrThrow({ where: { vendaId: v.id } })).id;
    const dev = await ped.registrarDevolucao({ vendaId: v.id, tipo: "DEVOLUCAO", itens: [{ vendaItemId: item, quantidade: 1 }] }, u);
    expect(Number(dev.total)).toBe(90);
    const { calcularDre } = await import("@/lib/financeiro/dre");
    const ano = Number(new Date().toLocaleDateString("en-CA", { timeZone: "America/Sao_Paulo" }).slice(0, 4));
    const venda = await prisma.venda.findUniqueOrThrow({ where: { id: v.id } });
    const anoVenda = Number(venda.data.toISOString().slice(0, 4));
    const cmv = async (a: number) => (await calcularDre(a)).linhas.find((l) => l.rotulo.startsWith("CMV"))?.total ?? 0;
    // vendeu 2 a 800 de custo e 1 voltou: se venda e devolução caem no mesmo ano, o CMV fica 800
    if (anoVenda === ano) expect(await cmv(ano)).toBe(800);
  });

  it("venda de valor zero (garantia/cortesia) não gera conta a receber de R$ 0,00", async () => {
    const v = await ped.salvarPedido(dados({ situacaoId: "sv_concretizada", desconto: "350,00", condicao: "AVISTA", parcelas: [] }), u);
    expect(Number(v.total)).toBe(0);
    expect(await recebiveis(v.id)).toHaveLength(0);
  });
});
