import { beforeAll, beforeEach, describe, expect, it } from "vitest";
import { execSync } from "node:child_process";

const URL = "postgresql://mxerp:mxerp@localhost:5432/mxerp_test?schema=public";
process.env.DATABASE_URL = URL;

const { prisma } = await import("@/lib/db");
const prod = await import("@/lib/itens/produtos");
const serv = await import("@/lib/itens/servicos");
const filtros = await import("@/lib/itens/filtros");
const imp = await import("@/lib/migracao/importar");
const { produtosDoXml } = await import("@/lib/itens/importacao");
const { tamanhoPagina, paginaDe, PADROES_ETIQUETA } = await import("@/lib/itens/etiquetas");
const { entrada } = await import("@/lib/estoque/estoque");

beforeAll(() => {
  execSync("npx prisma migrate deploy", { env: { ...process.env, DATABASE_URL: URL }, stdio: "ignore" });
});

let localId = "";
let varejo = "";
let atacado = "";
beforeEach(async () => {
  await prisma.$executeRawUnsafe(`TRUNCATE "HistoricoValor","ProdutoValor","ItemFornecedor","Anexo","Reserva","MovimentoEstoque","Saldo","OsItemServico","OsItemProduto","Servico","Produto","GrupoProduto","TipoValor","Local","Deposito","Pessoa","Sequencia" CASCADE`);
  const dep = await prisma.deposito.create({ data: { nome: "Loja" } });
  localId = (await prisma.local.create({ data: { depositoId: dep.id, codigo: "A1" } })).id;
  varejo = (await prisma.tipoValor.create({ data: { nome: "Varejo", lucro: 50, padrao: true } })).id;
  atacado = (await prisma.tipoValor.create({ data: { nome: "Atacado", lucro: 20 } })).id;
});

const dados = (m: Partial<import("@/lib/itens/tipos").DadosProduto> = {}): import("@/lib/itens/tipos").DadosProduto => ({
  nome: "Cabo UTP Cat6", codigo: "", gtin: "", grupoId: "", controlaEstoque: true, emiteNota: true, possuiVariacoes: false, possuiComposicao: false,
  unidade: "mt", converte: true, unidadeCompra: "cx", fatorConversao: "305", ativo: true, vendidoSeparadamente: true, vendePdv: true, comissao: "",
  camposExtras: {}, peso: "", largura: "", altura: "", comprimento: "", descricao: "", custo: "2,00", despesasAcessorias: "0,50", outrasDespesas: "0",
  valores: [
    { tipoValorId: varejo, nome: "Varejo", lucroSugerido: "50", lucroUtilizado: "60", valor: "4,00", ativo: true },
    { tipoValorId: atacado, nome: "Atacado", lucroSugerido: "20", lucroUtilizado: "20", valor: "3,00", ativo: true },
  ],
  estoqueMinimo: "10", estoqueMaximo: "", quantidadeInicial: "100", localId, ncm: "8544.49.00", cest: "", origem: "0", codigoBeneficio: "",
  pesoLiquido: "", pesoBruto: "", numeroFci: "", produtoEspecifico: "Não usar", cfopInterno: "", cfopExterno: "", csosn: "", cstIcms: "", aliquotaIcms: "",
  cstPis: "", cstCofins: "", cClassTrib: "", fornecedores: [], lojas: ["loja1"], variacoes: [], componentes: [], ...m,
});

describe("produtos", () => {
  it("cadastra com código gerado, valor padrão no preço, conversão de unidade, estoque inicial e histórico", async () => {
    const codigo = await prod.gerarCodigoProduto();
    const p = await prod.salvarProduto(dados({ codigo }), null);
    const r = await prisma.produto.findUniqueOrThrow({ where: { id: p.id }, include: { valores: true } });
    expect(r.codigo).toBe("1");
    expect(Number(r.precoVenda)).toBe(4);
    expect(r.unidade).toBe("MT");
    expect(r.unidadeCompra).toBe("CX");
    expect(Number(r.fatorConversao)).toBe(305);
    expect(r.ncm).toBe("85444900");
    expect(r.valores).toHaveLength(2);
    const saldo = await prisma.saldo.findFirstOrThrow({ where: { produtoId: p.id } });
    expect(Number(saldo.quantidade)).toBe(100);
    expect(await prisma.historicoValor.count({ where: { produtoId: p.id } })).toBe(3);
    expect(await prod.gerarCodigoProduto()).toBe("2");
  });

  it("alterar o valor registra histórico; código e código de barras não podem repetir", async () => {
    const p = await prod.salvarProduto(dados({ codigo: "10", gtin: "7891234567895" }), null);
    await prod.salvarProduto(dados({ codigo: "10", gtin: "7891234567895", valores: [{ tipoValorId: varejo, nome: "Varejo", lucroSugerido: "50", lucroUtilizado: "80", valor: "4,50", ativo: true }] }), null, p.id);
    const h = await prisma.historicoValor.findMany({ where: { produtoId: p.id, campo: "Varejo" }, orderBy: { createdAt: "asc" } });
    expect(h.map((x) => Number(x.novo))).toEqual([4, 4.5]);
    expect(Number((await prisma.produto.findUniqueOrThrow({ where: { id: p.id } })).precoVenda)).toBe(4.5);
    await expect(prod.salvarProduto(dados({ codigo: "10" }), null)).rejects.toThrow(/código 10/);
    await expect(prod.salvarProduto(dados({ codigo: "11", gtin: "7891234567895" }), null)).rejects.toThrow(/código de barras/);
  });

  it("excluir com movimentação só inativa; sem movimentação apaga; clonar gera novo código", async () => {
    const a = await prod.salvarProduto(dados({ codigo: "20" }), null);
    const b = await prod.salvarProduto(dados({ codigo: "21", quantidadeInicial: "" }), null);
    expect((await prod.excluirProduto(a.id)).mensagem).toMatch(/inativado/);
    expect((await prisma.produto.findUniqueOrThrow({ where: { id: a.id } })).ativo).toBe(false);
    const c = await prod.clonarProduto(b.id, null);
    expect(c.nome).toBe("Cabo UTP Cat6 (cópia)");
    expect(c.codigo).toBe("22");
    expect(await prisma.produtoValor.count({ where: { produtoId: c.id } })).toBe(2);
    await prod.excluirProduto(b.id);
    expect(await prisma.produto.findUnique({ where: { id: b.id } })).toBeNull();
  });

  it("ajuste de valores em massa por percentual atualiza o preço padrão", async () => {
    const p = await prod.salvarProduto(dados({ codigo: "30" }), null);
    const n = await prod.ajustarValoresEmMassa({ id: p.id }, { tipoValorId: varejo, modo: "percentual", percentual: 10 }, null);
    expect(n).toBe(1);
    expect(Number((await prisma.produto.findUniqueOrThrow({ where: { id: p.id } })).precoVenda)).toBe(4.4);
    await prod.ajustarValoresEmMassa({ id: p.id }, { tipoValorId: atacado, modo: "lucro" }, null);
    const at = await prisma.produtoValor.findFirstOrThrow({ where: { produtoId: p.id, tipoValorId: atacado } });
    expect(Number(at.valor)).toBe(3); // custo final 2,50 + 20%
  });

  it("composição não controla estoque próprio e exige componentes", async () => {
    const comp = await prod.salvarProduto(dados({ codigo: "40", quantidadeInicial: "" }), null);
    await expect(prod.salvarProduto(dados({ codigo: "41", possuiComposicao: true, quantidadeInicial: "" }), null)).rejects.toThrow(/componentes/);
    const kit = await prod.salvarProduto(dados({ codigo: "41", possuiComposicao: true, quantidadeInicial: "", componentes: [{ componenteId: comp.id, nome: "", quantidade: "2" }] }), null);
    expect(kit.controlaEstoque).toBe(false);
  });

  it("busca avançada: situação de estoque e grupo com subgrupos", async () => {
    const pai = await prisma.grupoProduto.create({ data: { nome: "INFORMATICA" } });
    const filho = await prisma.grupoProduto.create({ data: { nome: "CABOS", paiId: pai.id } });
    const com = await prod.salvarProduto(dados({ codigo: "50", grupoId: filho.id }), null);
    const sem = await prod.salvarProduto(dados({ codigo: "51", quantidadeInicial: "" }), null);
    const ids = async (sp: Record<string, string>) => (await prisma.produto.findMany({ where: await filtros.whereProdutos(sp), select: { id: true } })).map((x) => x.id);
    expect(await ids({ sit: "zero" })).toEqual([sem.id]);
    expect(await ids({ sit: "positivo" })).toEqual([com.id]);
    expect(await ids({ grupo: pai.id })).toEqual([com.id]);
    await prisma.$transaction((tx) => entrada(tx, { produtoId: sem.id, localId, quantidade: 5, custoUnit: 2, origemTipo: "AJUSTE" }));
    expect(await ids({ sit: "minimo" })).toEqual([sem.id]);
  });
});

describe("importação de itens", () => {
  it("planilha de produtos cria o valor de venda padrão", async () => {
    await imp.importarProdutos([{ codigo: "900", nome: "Conector RJ45", "valor de venda": "1,50", "valor de custo": "0,50", unidade: "un" }], { simular: false, importarEstoque: false });
    const p = await prisma.produto.findUniqueOrThrow({ where: { codigo: "900" }, include: { valores: true } });
    expect(p.valores).toHaveLength(1);
    expect(Number(p.valores[0].valor)).toBe(1.5);
    expect(Number(p.valores[0].lucroUtilizado)).toBe(200);
  });

  it("lê os itens de um XML de NF-e", async () => {
    const xml = `<nfeProc><NFe><infNFe><det nItem="1"><prod><cProd>ABC</cProd><cEAN>SEM GTIN</cEAN><xProd>Switch 8 portas</xProd><NCM>85176259</NCM><uCom>UN</uCom><vUnCom>199.9000</vUnCom></prod><imposto><ICMS><ICMSSN102><orig>2</orig></ICMSSN102></ICMS></imposto></det><det nItem="2"><prod><cProd>XYZ</cProd><cEAN>7891234567895</cEAN><xProd>Patch cord</xProd><NCM>85444200</NCM><uCom>PC</uCom><vUnCom>12.5</vUnCom></prod></det></infNFe></NFe></nfeProc>`;
    const l = await produtosDoXml(xml);
    expect(l).toHaveLength(2);
    expect(l[0]).toMatchObject({ codigo: "ABC", nome: "Switch 8 portas", "codigo de barras": "", origem: "2", "valor de venda": "199,9000" });
    expect(l[1]["codigo de barras"]).toBe("7891234567895");
    const r = await imp.importarProdutos(l, { simular: false, importarEstoque: false });
    expect(r.criados).toBe(2);
    expect((await prisma.produto.findUniqueOrThrow({ where: { codigo: "XYZ" } })).gtin).toBe("7891234567895");
    expect(Number((await prisma.produto.findUniqueOrThrow({ where: { codigo: "ABC" } })).precoVenda)).toBe(199.9);
  });
});

describe("serviços", () => {
  const s = (m: Partial<import("@/lib/itens/tipos").DadosServico> = {}): import("@/lib/itens/tipos").DadosServico => ({
    nome: "Instalação de câmera", codigo: "", comissao: "5", custo: "40,00", preco: "120,00", descricao: "", ativo: true, camposExtras: {},
    atividade: "", codigoLc116: "14.01", codigoTributacaoMunicipal: "", codigoTributacaoNacional: "14.01.01", codigoNbs: "", cnae: "", descricaoAtividade: "",
    aliquotaIss: "2", aliquotaCofins: "", aliquotaPis: "", aliquotaCsll: "", aliquotaIr: "", aliquotaInss: "",
    descontarImpostos: false, descontarDeducoes: false, construcaoCivil: false, reterIss: true, fornecedores: [], lojas: ["loja1"], ...m,
  });
  it("gera código, grava fiscal e não repete código", async () => {
    const a = await serv.salvarServico(s());
    expect(a.codigo).toBe("1");
    expect(a.codigoTributacaoNacional).toBe("140101");
    expect(Number(a.preco)).toBe(120);
    expect(a.reterIss).toBe(true);
    await expect(serv.salvarServico(s({ codigo: "1" }))).rejects.toThrow(/código 1/);
    expect((await serv.excluirServico(a.id)).mensagem).toMatch(/excluído/);
  });
});

describe("etiquetas", () => {
  it("página nomeada e bobina térmica", () => {
    expect(paginaDe("Carta").chave).toBe("CARTA");
    const t = PADROES_ETIQUETA.find((x) => x.nome.startsWith("Térmica 3"))!.medidas;
    expect(tamanhoPagina(t).largura).toBeCloseTo(0.2 + 3 * 3.3 + 2 * 0.2);
    const p = PADROES_ETIQUETA.find((x) => x.nome === "PIMACO 6180")!.medidas;
    // as 30 etiquetas cabem na folha carta
    expect(p.margemLateral + p.colunas * p.largura + (p.colunas - 1) * p.distHorizontal).toBeLessThanOrEqual(21.59);
    expect(p.margemSuperior + p.linhas * p.altura).toBeLessThanOrEqual(27.94);
  });
});
