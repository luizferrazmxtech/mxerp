import { beforeAll, beforeEach, describe, expect, it } from "vitest";
import { execSync } from "node:child_process";

const URL = "postgresql://mxerp:mxerp@localhost:5432/mxerp_test?schema=public";
process.env.DATABASE_URL = URL;

const { prisma } = await import("@/lib/db");
const est = await import("@/lib/estoque/estoque");
const cmp = await import("@/lib/compras/compras");
const { compraDoXml } = await import("@/lib/compras/xml");
const doc = await import("@/lib/estoque/documentos");
const conv = await import("@/lib/itens/conversao");
const { relatorioCustos, csvCustos } = await import("@/lib/estoque/custos");
const { custoPorSaida } = await import("@/lib/migracao/gestaoclick");
const { fatorPeloNome, mesmaUnidade } = await import("@/lib/itens/unidades");
type Dados = import("@/lib/compras/tipos").DadosCompra;
type Linha = Dados["produtos"][number];

let cabo = "", nylon = "", forn = "", forn2 = "", loc = "";
let u = { id: "", nome: "Luiz", papel: "ADMIN" as const };

beforeAll(() => {
  execSync("npx prisma migrate deploy", { env: { ...process.env, DATABASE_URL: URL }, stdio: "ignore" });
});

beforeEach(async () => {
  await prisma.$executeRawUnsafe(`TRUNCATE "Compra","Cotacao","AjusteEstoque","TransferenciaEstoque","Inventario","Orcamento","Anotacao","Lancamento","VendaPagamento","VendaItem","Venda","OrdemServico","Reserva","MovimentoEstoque","Saldo","ItemFornecedor","HistoricoValor","Produto","Servico","Local","Deposito","Pessoa","Sequencia" CASCADE`);
  await prisma.configuracao.deleteMany({ where: { chave: "estoque" } });
  const dep = (await prisma.deposito.create({ data: { nome: "Loja" } })).id;
  loc = (await prisma.local.create({ data: { depositoId: dep, codigo: "A-01" } })).id;
  // cabo vendido por metro, comprado em caixa de 305 m (já com conversão no cadastro)
  cabo = (await prisma.produto.create({ data: { codigo: "CABO6", nome: "CABO UTP CAT6 CX 305M", unidade: "MT", unidadeCompra: "CX", fatorConversao: 305, precoVenda: 4.5, custo: 0, localPadraoId: loc } })).id;
  // fio de nylon vendido por metro, ainda sem conversão
  nylon = (await prisma.produto.create({ data: { codigo: "NYLON", nome: "FIO DE NYLON", unidade: "MT", precoVenda: 1, custo: 0.2, localPadraoId: loc } })).id;
  forn = (await prisma.pessoa.create({ data: { nome: "Distribuidora Alfa", documento: "11222333000181", fornecedor: true } })).id;
  forn2 = (await prisma.pessoa.create({ data: { nome: "Distribuidora Beta", fornecedor: true } })).id;
  const usuario = await prisma.usuario.upsert({ where: { email: "conv@local.test" }, update: {}, create: { nome: "Luiz", email: "conv@local.test", papel: "ADMIN" } });
  u = { id: usuario.id, nome: usuario.nome, papel: "ADMIN" };
});

const fisico = async (id: string) => (await prisma.$transaction((tx) => est.resumoProduto(tx, id))).fisico;
const custo = async (id: string) => Number((await prisma.produto.findUniqueOrThrow({ where: { id } })).custo);
const linha = (m: Partial<Linha> = {}): Linha => ({ produtoId: cabo, nome: "Cabo", codigo: "CABO6", unidade: "MT", detalhes: "", quantidade: "2", valorUnit: "610,00", desconto: "", descontoPct: false, unidadeCompra: "CX", fator: "305", ...m });
const dados = (m: Partial<Dados> = {}): Dados => ({
  tipo: "PRODUTO", numero: "", fornecedorId: forn, fornecedorNome: "", data: "2026-11-10", situacaoId: "sc_confirmada", numeroNfe: "", chaveNfe: "", centroCusto: "",
  produtos: [linha()], servicos: [], transportadoraId: "", transportadoraNome: "", frete: "0,00", freteNoTotal: true, impostos: "0,00", impostosNoTotal: false,
  desconto: "", descontoPct: false, condicao: "AVISTA", formaPagamentoId: "", vencimento: "2026-11-20", intervaloDias: "30", numParcelas: "1", primeiraParcela: "",
  parcelas: [], observacoes: "", observacaoInterna: "", camposExtras: {}, ...m,
});

function xmlNfe(itens: { cProd: string; xProd: string; uCom: string; qCom: number; vUnCom: number }[], chave = "35261111222333000181550010000012341000012345") {
  const det = itens.map((i, k) => `<det nItem="${k + 1}"><prod><cProd>${i.cProd}</cProd><cEAN>SEM GTIN</cEAN><xProd>${i.xProd}</xProd><uCom>${i.uCom}</uCom><qCom>${i.qCom}</qCom><vUnCom>${i.vUnCom}</vUnCom><vProd>${(i.qCom * i.vUnCom).toFixed(2)}</vProd></prod></det>`).join("");
  return `<?xml version="1.0"?><nfeProc><NFe><infNFe Id="NFe${chave}"><ide><nNF>1234</nNF><dhEmi>2026-11-12T10:00:00-03:00</dhEmi></ide>
    <emit><CNPJ>11222333000181</CNPJ><xNome>Distribuidora Alfa</xNome></emit>${det}<total><ICMSTot><vFrete>0</vFrete></ICMSTot></total></infNFe></NFe></nfeProc>`;
}

describe("unidades", () => {
  it("compara unidades escritas de jeitos diferentes e acha a metragem no nome", () => {
    expect(mesmaUnidade("UND", "un")).toBe(true);
    expect(mesmaUnidade("MTS", "MT")).toBe(true);
    expect(mesmaUnidade("CX", "MT")).toBe(false);
    expect(fatorPeloNome("CABO UTP CAT6 CX 305M AZUL", "MT")).toBe(305);
    expect(fatorPeloNome("ROLO NYLON 100 METROS", "M")).toBe(100);
    expect(fatorPeloNome("CABO 305M", "UN")).toBeNull();
  });
});

describe("compra com conversão de unidade (lançada à mão)", () => {
  it("2 CX de 305 m entram 610 MT, com o custo por metro", async () => {
    const c = await cmp.salvarCompra(dados(), u);
    expect(await fisico(cabo)).toBe(610);
    expect(await custo(cabo)).toBeCloseTo(1220 / 610, 4); // custo zerado não puxa a média: fica R$ 2,00/MT
    const item = await prisma.compraItem.findFirstOrThrow({ where: { compraId: c.id } });
    expect([item.unidadeCompra, Number(item.fator), Number(item.quantidade)]).toEqual(["CX", 305, 2]);
    // editar só a conversão refaz a entrada; cancelar estorna tudo
    await cmp.salvarCompra(dados({ produtos: [linha({ fator: "300" })] }), u, c.id);
    expect(await fisico(cabo)).toBe(600);
    await cmp.alterarSituacaoCompra(c.id, "sc_cancelada", u);
    expect(await fisico(cabo)).toBe(0);
  });

  it("recusa unidade de compra sem fator e grava a conversão no produto quando marcado", async () => {
    await expect(cmp.salvarCompra(dados({ produtos: [linha({ produtoId: nylon, unidadeCompra: "RL", fator: "" })] }), u)).rejects.toThrow(/quantos MT vêm em 1 RL/);
    await cmp.salvarCompra(dados({ produtos: [linha({ produtoId: nylon, unidadeCompra: "RL", fator: "100", quantidade: "3", valorUnit: "25,00", salvarConversao: true })] }), u);
    const p = await prisma.produto.findUniqueOrThrow({ where: { id: nylon } });
    expect([p.unidadeCompra, Number(p.fatorConversao)]).toEqual(["RL", 100]);
    expect(await fisico(nylon)).toBe(300);
    expect(await custo(nylon)).toBeCloseTo(0.25, 4);
  });
});

describe("entrada por XML", () => {
  it("usa a conversão do cadastro, sugere a do nome, aprende o vínculo e avisa nota repetida", async () => {
    await prisma.itemFornecedor.create({ data: { fornecedorId: forn, produtoId: nylon, codigo: "N-100" } });
    const xml = xmlNfe([
      { cProd: "A-305", xProd: "CABO UTP CAT6 CX 305M", uCom: "CX", qCom: 2, vUnCom: 610 },
      { cProd: "N-100", xProd: "FIO DE NYLON ROLO 100M", uCom: "RL", qCom: 1, vUnCom: 30 },
    ]);
    const r1 = await compraDoXml(xml);
    expect(r1.dados.fornecedorId).toBe(forn);
    const [l1, l2] = r1.dados.produtos!;
    expect(l1).toMatchObject({ produtoId: cabo, unidadeCompra: "CX", fator: "305", codigoFornecedor: "A-305" });
    // o nylon liga pelo código do fornecedor; sem conversão no cadastro, o fator vem da metragem do nome e é marcado para gravar
    expect(l2).toMatchObject({ produtoId: nylon, unidadeCompra: "RL", fator: "100", salvarConversao: true });
    expect(r1.avisos.join(" ")).toMatch(/Confira a conversão/);

    await cmp.salvarCompra(dados({ ...r1.dados, situacaoId: "sc_confirmada", chaveNfe: r1.dados.chaveNfe, produtos: r1.dados.produtos }), u);
    expect(await fisico(cabo)).toBe(610);
    expect(await fisico(nylon)).toBe(100);
    expect(await custo(nylon)).toBeCloseTo(0.3, 4);
    expect(await prisma.itemFornecedor.count({ where: { fornecedorId: forn, codigo: "A-305", produtoId: cabo } })).toBe(1);

    // a mesma nota de novo: avisa; uma nota nova com outro nome liga pelo código do fornecedor
    const r2 = await compraDoXml(xml);
    expect(r2.avisos[0]).toMatch(/já foi lançada na compra nº 1/);
    const r3 = await compraDoXml(xmlNfe([{ cProd: "A-305", xProd: "CB REDE CAT.6 AZ", uCom: "CX", qCom: 1, vUnCom: 600 }], "35261111222333000181550010000099991000099999"));
    expect(r3.dados.produtos![0]).toMatchObject({ produtoId: cabo, unidadeCompra: "CX", fator: "305" });
  });
});

describe("entrada manual de estoque (ajuste) com conversão", () => {
  it("converte a quantidade e, se marcado, atualiza o custo", async () => {
    const a = await doc.criarAjuste({ tipo: "ENTRADA", frete: "0", observacoes: "", atualizarCusto: true, itens: [{ produtoId: cabo, quantidade: "1", custo: "549,00", unidadeCompra: "CX", fator: "305" }] }, u);
    expect(await fisico(cabo)).toBe(305);
    expect(await custo(cabo)).toBeCloseTo(1.8, 4);
    const it = await prisma.ajusteEstoqueItem.findFirstOrThrow({ where: { ajusteId: a.id } });
    expect([Number(it.quantidade), Number(it.custoUnit), Number(it.total)]).toEqual([305, 1.8, 549]);
    // sem marcar, o custo fica
    await doc.criarAjuste({ tipo: "ENTRADA", frete: "0", observacoes: "", itens: [{ produtoId: cabo, quantidade: "10", custo: "5,00" }] }, u);
    expect(await custo(cabo)).toBeCloseTo(1.8, 4);
  });
});

describe("alterar conversão depois", () => {
  it("corrige as compras já lançadas, o estoque e o custo das vendas", async () => {
    // compra antiga lançada sem conversão: 2 "metros" a R$ 610 (eram caixas)
    await cmp.salvarCompra(dados({ produtos: [linha({ produtoId: nylon, unidadeCompra: "", fator: "", quantidade: "2", valorUnit: "50,00" })] }), u);
    expect(await fisico(nylon)).toBe(2);
    expect(await custo(nylon)).toBeCloseTo(50, 4);
    const venda = await prisma.venda.create({ data: { numero: 1, clienteId: forn2, itens: { create: [{ produtoId: nylon, quantidade: 1, valorUnit: 1, custoUnit: 50, subtotal: 1 }] } } });

    const sim = await conv.simularConversao(nylon, "RL", "100");
    expect(sim.opcoes.PROPORCIONAL).toBeCloseTo(0.5, 4);
    expect(sim.opcoes.ULTIMA).toBeCloseTo(0.5, 4);
    expect(sim.compras).toHaveLength(1);
    expect(sim.compras[0]).toMatchObject({ entraAntes: 2, entraDepois: 200 });

    const r = await conv.alterarConversao(nylon, { unidadeCompra: "RL", fator: "100", base: "ULTIMA", corrigirCompras: true, corrigirLancados: true }, u);
    expect(r).toMatchObject({ corrigidas: 1, fator: 100 });
    expect(await fisico(nylon)).toBe(200);
    expect(await custo(nylon)).toBeCloseTo(0.5, 4);
    const p = await prisma.produto.findUniqueOrThrow({ where: { id: nylon } });
    expect([p.unidadeCompra, Number(p.fatorConversao)]).toEqual(["RL", 100]);
    expect(Number((await prisma.vendaItem.findFirstOrThrow({ where: { vendaId: venda.id } })).custoUnit)).toBeCloseTo(0.5, 4);
    expect(await prisma.historicoValor.count({ where: { produtoId: nylon } })).toBe(2);
  });

  it("proporcional mantém o custo da caixa quando só o fator muda", async () => {
    await prisma.produto.update({ where: { id: cabo }, data: { custo: 2 } }); // R$ 610 a caixa com 305
    const r = await conv.alterarConversao(cabo, { unidadeCompra: "CX", fator: "300", base: "PROPORCIONAL", corrigirCompras: false, corrigirLancados: false }, u);
    expect(r.custo).toBeCloseTo(610 / 300, 4);
  });
});

describe("relatório de custos", () => {
  it("último, médio, menor e maior por metro, margem, melhor fornecedor e rateio do frete", async () => {
    await cmp.salvarCompra(dados({ data: "2026-10-01", produtos: [linha({ quantidade: "1", valorUnit: "671,00" })] }), u); // 2,20/MT
    await cmp.salvarCompra(dados({ data: "2026-11-01", fornecedorId: forn2, produtos: [linha({ quantidade: "2", valorUnit: "610,00" })], frete: "61,00" }), u); // 2,00 + 0,10 frete
    const r = await relatorioCustos({ q: "CABO6", de: "2026-01-01", ate: "2026-12-31", base: "ULTIMA" });
    const l = r.linhas[0];
    expect(l.conversao).toBe("1 CX = 305 MT");
    expect(l.ultima?.custo).toBeCloseTo(2.1, 4);
    expect(l.ultima?.fornecedor).toBe("Distribuidora Beta");
    expect(l.menor).toBeCloseTo(2.1, 4);
    expect(l.maior).toBeCloseTo(2.2, 4);
    expect(l.media).toBeCloseTo((305 * 2.2 + 610 * 2.1) / 915, 4);
    expect(l.margem).toBeCloseTo(((4.5 - 2.1) / 4.5) * 100, 2);
    expect(l.nFornecedores).toBe(2);
    expect(r.fornecedores.find((f) => f.melhor)?.fornecedor).toBe("Distribuidora Beta");

    const semRateio = await relatorioCustos({ q: "CABO6", de: "2026-01-01", ate: "2026-12-31", rateio: "0" });
    expect(semRateio.linhas[0].ultima?.custo).toBeCloseTo(2, 4);
    const negativos = await relatorioCustos({ de: "2026-01-01", ate: "2026-12-31", filtro: "semCusto" });
    expect(negativos.linhas.map((x) => x.codigo)).not.toContain("CABO6");
    const csv = await csvCustos({ q: "CABO6", de: "2026-01-01", ate: "2026-12-31", visao: "compras" });
    expect(csv.split("\r\n")).toHaveLength(3);
  });
});

describe("migração do Gestão Click", () => {
  it("leva a conversão achada pela metragem do nome", () => {
    const r = custoPorSaida({ codigo: "1", produto: "CABO CAT6 305M", "valor de custo": "610,00", "valor varejo": "4,50", "unidade de entrada": "CX", "unidade de saida": "MT" });
    expect(r).toMatchObject({ unidadeCompra: "CX", fator: 305 });
    expect(r.custo).toBeCloseTo(2, 4);
  });
});
