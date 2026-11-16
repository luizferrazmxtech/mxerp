import { beforeAll, beforeEach, describe, expect, it } from "vitest";
import { execSync } from "node:child_process";

const URL = "postgresql://mxerp:mxerp@localhost:5432/mxerp_test?schema=public";
process.env.DATABASE_URL = URL;

const { prisma } = await import("@/lib/db");
const est = await import("@/lib/estoque/estoque");
const cmp = await import("@/lib/compras/compras");
const doc = await import("@/lib/estoque/documentos");
const cot = await import("@/lib/compras/cotacoes");
const { gerarParcelas } = await import("@/lib/orcamentos/orcamentos");
type Dados = import("@/lib/compras/tipos").DadosCompra;

let prod = "", serv = "", forn = "", forn2 = "", loc = "", locB = "", depA = "", depB = "";
let u = { id: "", nome: "Caue", papel: "OPERADOR" as const };

beforeAll(() => {
  execSync("npx prisma migrate deploy", { env: { ...process.env, DATABASE_URL: URL }, stdio: "ignore" });
});

beforeEach(async () => {
  await prisma.$executeRawUnsafe(`TRUNCATE "Compra","Cotacao","AjusteEstoque","TransferenciaEstoque","Inventario","Orcamento","Anotacao","Lancamento","VendaPagamento","VendaItem","Venda","OrdemServico","Reserva","MovimentoEstoque","Saldo","ItemFornecedor","Produto","Servico","Local","Deposito","Pessoa","Sequencia" CASCADE`);
  await prisma.configuracao.deleteMany({ where: { chave: "estoque" } });
  await prisma.situacaoCompraConfig.updateMany({ data: { bloqueados: [], permiteEdicao: true } });
  depA = (await prisma.deposito.create({ data: { nome: "Loja" } })).id;
  depB = (await prisma.deposito.create({ data: { nome: "Filial" } })).id;
  loc = (await prisma.local.create({ data: { depositoId: depA, codigo: "A-01" } })).id;
  locB = (await prisma.local.create({ data: { depositoId: depB, codigo: "B-01" } })).id;
  prod = (await prisma.produto.create({ data: { codigo: "HD", nome: "HD 1TB", gtin: "7890000000011", precoVenda: 400, custo: 200, localPadraoId: loc } })).id;
  serv = (await prisma.servico.create({ data: { codigo: "FRT", nome: "Frete terceirizado", preco: 50 } })).id;
  forn = (await prisma.pessoa.create({ data: { nome: "Distribuidora Alfa", fornecedor: true } })).id;
  forn2 = (await prisma.pessoa.create({ data: { nome: "Distribuidora Beta", fornecedor: true } })).id;
  const usuario = await prisma.usuario.upsert({ where: { email: "cmp@local.test" }, update: {}, create: { nome: "Caue", email: "cmp@local.test", papel: "OPERADOR" } });
  u = { id: usuario.id, nome: usuario.nome, papel: "OPERADOR" };
  await prisma.$transaction((tx) => est.entrada(tx, { produtoId: prod, localId: loc, quantidade: 2, origemTipo: "IMPLANTACAO" }));
});

const estoque = () => prisma.$transaction((tx) => est.resumoProduto(tx, prod));
const pagar = (id: string) => prisma.lancamento.findMany({ where: { origemTipo: "COMPRA", origemId: id }, orderBy: { parcela: "asc" } });
const custo = async () => Number((await prisma.produto.findUniqueOrThrow({ where: { id: prod } })).custo);

const dados = (m: Partial<Dados> = {}): Dados => ({
  tipo: "PRODUTO", numero: "", fornecedorId: forn, fornecedorNome: "", data: "2026-11-16", situacaoId: "sc_aberto", numeroNfe: "", chaveNfe: "", centroCusto: "",
  produtos: [{ produtoId: prod, nome: "HD", codigo: "HD", unidade: "UN", detalhes: "", quantidade: "2", valorUnit: "300,00", desconto: "", descontoPct: false }],
  servicos: [], transportadoraId: "", transportadoraNome: "", frete: "20,00", freteNoTotal: true, impostos: "10,00", impostosNoTotal: false,
  desconto: "", descontoPct: false, condicao: "PARCELADO", formaPagamentoId: "", vencimento: "", intervaloDias: "30", numParcelas: "2", primeiraParcela: "2026-12-10",
  parcelas: gerarParcelas(620, 2, "2026-12-10", 30, ""), observacoes: "", observacaoInterna: "", camposExtras: {}, ...m,
});

describe("compras com situações configuráveis", () => {
  it("em aberto não lança; confirmada dá entrada, atualiza o custo pela média e gera contas a pagar; cancelada estorna", async () => {
    const c = await cmp.salvarCompra(dados(), u);
    expect(Number(c.total)).toBe(620); // 600 + frete 20 (impostos fora do total)
    expect(await estoque()).toMatchObject({ fisico: 2 });
    expect(await pagar(c.id)).toHaveLength(0);

    await cmp.alterarSituacaoCompra(c.id, "sc_confirmada", u);
    expect(await estoque()).toMatchObject({ fisico: 4 });
    expect(await custo()).toBe(250); // (2×200 + 2×300) / 4
    const l = await pagar(c.id);
    expect(l.map((x) => [x.tipo, Number(x.valor)])).toEqual([["PAGAR", 310], ["PAGAR", 310]]);

    await cmp.alterarSituacaoCompra(c.id, "sc_cancelada", u);
    expect(await estoque()).toMatchObject({ fisico: 2 });
    expect(await pagar(c.id)).toHaveLength(0);
    expect(await prisma.compraHistorico.count({ where: { compraId: c.id } })).toBe(3);
  });

  it("lança somente estoque / somente financeiro; custo pela última compra; editar a quantidade refaz a entrada", async () => {
    await prisma.configuracao.create({ data: { chave: "estoque", valor: { custoCompra: "ULTIMA" } } });
    const soEstoque = await prisma.situacaoCompraConfig.create({ data: { nome: "Recebida", lancamento: "ESTOQUE" } });
    const c = await cmp.salvarCompra(dados({ situacaoId: soEstoque.id, condicao: "AVISTA", parcelas: [] }), u);
    expect(await estoque()).toMatchObject({ fisico: 4 });
    expect(await custo()).toBe(300);
    expect(await pagar(c.id)).toHaveLength(0);

    await cmp.salvarCompra(dados({ situacaoId: soEstoque.id, condicao: "AVISTA", parcelas: [], produtos: [{ ...dados().produtos[0], quantidade: "5" }] }), u, c.id);
    expect(await estoque()).toMatchObject({ fisico: 7 });

    const soFin = await prisma.situacaoCompraConfig.create({ data: { nome: "A pagar", lancamento: "FINANCEIRO" } });
    await cmp.alterarSituacaoCompra(c.id, soFin.id, u);
    expect(await estoque()).toMatchObject({ fisico: 2 });
    expect((await pagar(c.id)).map((x) => Number(x.valor))).toEqual([1520]);
  });

  it("situação sem edição trava; parcelas que não fecham são recusadas; excluir estorna", async () => {
    await expect(cmp.salvarCompra(dados({ parcelas: gerarParcelas(600, 2, "2026-12-10", 30, "") }), u)).rejects.toThrow(/não fecha/);
    const c = await cmp.salvarCompra(dados({ situacaoId: "sc_confirmada" }), u);
    await prisma.situacaoCompraConfig.update({ where: { id: "sc_confirmada" }, data: { permiteEdicao: false } });
    await expect(cmp.salvarCompra(dados({ situacaoId: "sc_confirmada" }), u, c.id)).rejects.toThrow(/não podem ser editadas/);
    await prisma.situacaoCompraConfig.update({ where: { id: "sc_confirmada" }, data: { permiteEdicao: true } });
    await cmp.excluirCompra(c.id, u);
    expect(await estoque()).toMatchObject({ fisico: 2 });
    expect(await prisma.lancamento.count()).toBe(0);
  });
});

describe("ajustes, transferências e inventário", () => {
  it("ajuste de entrada e de saída; zerar estoque", async () => {
    const a = await doc.criarAjuste({ tipo: "ENTRADA", frete: "5", observacoes: "", itens: [{ produtoId: prod, quantidade: "3", custo: "200" }] }, u);
    expect(Number(a.total)).toBe(605);
    expect(await estoque()).toMatchObject({ fisico: 5 });
    await doc.criarAjuste({ tipo: "SAIDA", frete: "0", observacoes: "quebra", itens: [{ produtoId: prod, quantidade: "1", custo: "200" }] }, u);
    expect(await estoque()).toMatchObject({ fisico: 4 });
    await doc.zerarEstoque(u);
    expect(await estoque()).toMatchObject({ fisico: 0 });
    expect(await prisma.ajusteEstoque.count()).toBe(3);
  });

  it("transferência entre lojas move o saldo e recusa quantidade maior que a origem", async () => {
    await doc.criarTransferencia({ origemDepositoId: depA, destinoDepositoId: depB, observacoes: "", itens: [{ produtoId: prod, quantidade: "1,5" }] }, u);
    const s = await prisma.saldo.findMany({ where: { produtoId: prod }, orderBy: { localId: "asc" } });
    expect(Object.fromEntries(s.map((x) => [x.localId, Number(x.quantidade)]))).toEqual({ [loc]: 0.5, [locB]: 1.5 });
    await expect(doc.criarTransferencia({ origemDepositoId: depA, destinoDepositoId: depB, observacoes: "", itens: [{ produtoId: prod, quantidade: "1" }] }, u)).rejects.toThrow(/só tem/);
  });

  it("inventário: leitor soma leituras, concluir acerta o saldo considerando o que entrou durante a contagem", async () => {
    const inv = await doc.criarInventario({ descricao: "Geral", responsavelId: u.id, responsavelNome: u.nome, data: "2026-11-16", motivo: "", escopo: "TODOS", filtroIds: [], contagemCega: true, somarLeituras: true, considerarMovimento: true });
    await doc.lerCodigo(inv.id, "7890000000011");
    await doc.lerCodigo(inv.id, "hd");
    await doc.lerCodigo(inv.id, "7890000000011");
    // durante a contagem entra 1 peça: conta 3 + 1 = 4
    await prisma.$transaction((tx) => est.entrada(tx, { produtoId: prod, localId: loc, quantidade: 1, origemTipo: "AJUSTE" }));
    await doc.concluirInventario(inv.id, u);
    expect(await estoque()).toMatchObject({ fisico: 4 });
    await expect(doc.lerCodigo(inv.id, "HD")).rejects.toThrow(/encerrado/);
  });
});

describe("cotações", () => {
  it("cada fornecedor responde pelo link; o comparativo acha o menor preço e a compra sai com os valores escolhidos", async () => {
    const c = await cot.salvarCotacao({
      data: "2026-11-16", prazo: "2026-11-20", observacoes: "", observacaoInterna: "",
      fornecedores: [{ fornecedorId: forn, nome: "Alfa", email: "alfa@exemplo.test", celular: "" }, { fornecedorId: forn2, nome: "Beta", email: "beta@exemplo.test", celular: "" }],
      itens: [{ produtoId: prod, servicoId: "", nome: "HD 1TB", detalhes: "", quantidade: "4", unidade: "UN" }],
    }, u);
    const fs = await prisma.cotacaoFornecedor.findMany({ where: { cotacaoId: c.id }, include: { cotacao: { include: { itens: true } } } });
    const item = fs[0].cotacao.itens[0].id;
    const alfa = fs.find((f) => f.fornecedorId === forn)!, beta = fs.find((f) => f.fornecedorId === forn2)!;
    await cot.responderCotacao(alfa.token, { valores: { [item]: "280,00" }, frete: "0", prazoEntrega: "5 dias", condicao: "", observacao: "" });
    await cot.responderCotacao(beta.token, { valores: { [item]: "260,00" }, frete: "30", prazoEntrega: "", condicao: "", observacao: "" });
    const cmpv = await cot.comparativo(c.id);
    expect(cmpv.melhor.get(item)?.fornecedorId).toBe(beta.id);
    expect(cmpv.totais.get(beta.id)?.total).toBe(1070);

    const base = await cot.compraDaCotacao(c.id, beta.id);
    const compra = await cmp.salvarCompra(dados({ ...base, situacaoId: "sc_confirmada", condicao: "AVISTA", parcelas: [], impostos: "0" } as Partial<Dados>), u);
    expect(Number(compra.total)).toBe(1070);
    expect((await prisma.cotacao.findUniqueOrThrow({ where: { id: c.id } })).situacao).toBe("FINALIZADA");
    await expect(cot.responderCotacao(alfa.token, { valores: { [item]: "1" }, frete: "", prazoEntrega: "", condicao: "", observacao: "" })).rejects.toThrow(/encerrada/);
  });
});
