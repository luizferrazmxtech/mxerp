import { beforeAll, beforeEach, describe, expect, it } from "vitest";
import { execSync } from "node:child_process";

const URL = "postgresql://mxerp:mxerp@localhost:5432/mxerp_test?schema=public";
process.env.DATABASE_URL = URL;

const { prisma } = await import("@/lib/db");
const cmp = await import("@/lib/compras/compras");
const { compraDoXml } = await import("@/lib/compras/xml");
const { criarProdutoDaNota } = await import("@/lib/compras/produtoDaNota");
const { xmlDaCompra } = await import("@/lib/compras/nfeCompra");
const { semelhanca } = await import("@/lib/compras/sugestoes");
const { gerarDanfePdf } = await import("@/lib/fiscal/danfePdf");
type Dados = import("@/lib/compras/tipos").DadosCompra;

let forn = "", loc = "", conector = "";
let u = { id: "", nome: "Luiz", papel: "ADMIN" as const };
const CHAVE = "35261111222333000181550010000012341000012345";

beforeAll(() => {
  execSync("npx prisma migrate deploy", { env: { ...process.env, DATABASE_URL: URL }, stdio: "ignore" });
});

beforeEach(async () => {
  await prisma.$executeRawUnsafe(`TRUNCATE "Compra","Lancamento","Reserva","MovimentoEstoque","Saldo","ItemFornecedor","HistoricoValor","ProdutoValor","Produto","Local","Deposito","Pessoa","Sequencia","NotaRecebida","Anexo" CASCADE`);
  await prisma.configuracao.deleteMany({ where: { chave: "estoque" } });
  const dep = (await prisma.deposito.create({ data: { nome: "Loja" } })).id;
  loc = (await prisma.local.create({ data: { depositoId: dep, codigo: "A-01" } })).id;
  conector = (await prisma.produto.create({ data: { codigo: "RJ45", nome: "CONECTOR RJ45 CAT6 MACHO", unidade: "UN", precoVenda: 2, custo: 0.8, localPadraoId: loc } })).id;
  await prisma.produto.create({ data: { codigo: "TOM", nome: "TOMADA 2P+T 10A BRANCA", unidade: "UN", precoVenda: 9, custo: 4, localPadraoId: loc } });
  forn = (await prisma.pessoa.create({ data: { nome: "Distribuidora Alfa", documento: "11222333000181", fornecedor: true } })).id;
  const usuario = await prisma.usuario.upsert({ where: { email: "nota@local.test" }, update: {}, create: { nome: "Luiz", email: "nota@local.test", papel: "ADMIN" } });
  u = { id: usuario.id, nome: usuario.nome, papel: "ADMIN" };
});

type Item = { cProd: string; xProd: string; uCom: string; qCom: number; vUnCom: number; ean?: string; ncm?: string; cest?: string; cfop?: string; icms?: string };
function xmlNfe(itens: Item[]) {
  const det = itens.map((i, k) => `<det nItem="${k + 1}"><prod><cProd>${i.cProd}</cProd><cEAN>${i.ean ?? "SEM GTIN"}</cEAN><xProd>${i.xProd}</xProd><NCM>${i.ncm ?? "85444900"}</NCM>${i.cest ? `<CEST>${i.cest}</CEST>` : ""}<CFOP>${i.cfop ?? "6102"}</CFOP>
    <uCom>${i.uCom}</uCom><qCom>${i.qCom}</qCom><vUnCom>${i.vUnCom}</vUnCom><vProd>${(i.qCom * i.vUnCom).toFixed(2)}</vProd><uTrib>${i.uCom}</uTrib><qTrib>${i.qCom}</qTrib><vUnTrib>${i.vUnCom}</vUnTrib><indTot>1</indTot></prod>
    <imposto>${i.icms ?? "<ICMS><ICMS00><orig>0</orig><CST>00</CST><modBC>3</modBC><vBC>100</vBC><pICMS>12</pICMS><vICMS>12</vICMS></ICMS00></ICMS>"}<IPI><cEnq>999</cEnq><IPITrib><CST>50</CST><vBC>100</vBC><pIPI>5</pIPI><vIPI>5</vIPI></IPITrib></IPI></imposto></det>`).join("");
  return `<?xml version="1.0"?><nfeProc><NFe><infNFe Id="NFe${CHAVE}" versao="4.00"><ide><cUF>35</cUF><natOp>VENDA</natOp><mod>55</mod><serie>1</serie><nNF>1234</nNF><dhEmi>2026-11-12T10:00:00-03:00</dhEmi><tpNF>1</tpNF><tpAmb>1</tpAmb></ide>
    <emit><CNPJ>11222333000181</CNPJ><xNome>Distribuidora Alfa</xNome><enderEmit><xLgr>Rua A</xLgr><nro>1</nro><xBairro>Centro</xBairro><xMun>Sao Paulo</xMun><UF>SP</UF><CEP>01001000</CEP></enderEmit><IE>123456789</IE></emit>
    <dest><CNPJ>12965283000195</CNPJ><xNome>MXTECH</xNome><enderDest><xLgr>Rua B</xLgr><nro>2</nro><xBairro>Centro</xBairro><xMun>Joao Pessoa</xMun><UF>PB</UF><CEP>58000000</CEP></enderDest></dest>
    ${det}<total><ICMSTot><vBC>0</vBC><vICMS>0</vICMS><vST>0</vST><vProd>0</vProd><vFrete>0</vFrete><vNF>759</vNF></ICMSTot></total><transp><modFrete>0</modFrete></transp></infNFe></NFe>
    <protNFe><infProt><chNFe>${CHAVE}</chNFe><dhRecbto>2026-11-12T10:00:01-03:00</dhRecbto><nProt>135260000000001</nProt></infProt></protNFe></nfeProc>`;
}
const ST = "<ICMS><ICMS10><orig>1</orig><CST>10</CST><modBC>3</modBC><vBC>100</vBC><pICMS>12</pICMS><vICMS>12</vICMS><modBCST>4</modBCST><vBCST>150</vBCST><pICMSST>18</pICMSST><vICMSST>15</vICMSST></ICMS10></ICMS>";

const dados = (m: Partial<Dados>): Dados => ({
  tipo: "PRODUTO", numero: "", fornecedorId: forn, fornecedorNome: "", data: "2026-11-12", situacaoId: "sc_confirmada", numeroNfe: "1234", chaveNfe: CHAVE, centroCusto: "",
  produtos: [], servicos: [], transportadoraId: "", transportadoraNome: "", frete: "0,00", freteNoTotal: true, impostos: "0,00", impostosNoTotal: false,
  desconto: "", descontoPct: false, condicao: "AVISTA", formaPagamentoId: "", vencimento: "2026-11-20", intervaloDias: "30", numParcelas: "1", primeiraParcela: "",
  parcelas: [], observacoes: "", observacaoInterna: "", camposExtras: {}, ...m,
});

describe("lançar compra da nota recebida", () => {
  it("compara descrições parecidas", () => {
    expect(semelhanca("CONECTOR RJ-45 CAT.6 MACHO", "CONECTOR RJ45 CAT6 MACHO")).toBeGreaterThan(0.4);
    expect(semelhanca("CONECTOR RJ-45 CAT.6 MACHO", "TOMADA 2P+T 10A BRANCA")).toBeLessThan(0.2);
  });

  it("traz os dados fiscais de cada item, sugere produtos parecidos e marca ST", async () => {
    const xml = xmlNfe([
      { cProd: "F-1", xProd: "CONECTOR RJ45 CAT6 MACHO PCT", uCom: "PCT", qCom: 1, vUnCom: 50 },
      { cProd: "F-2", xProd: "CABO REDE CAT6 AZUL CX 305M", uCom: "CX", qCom: 2, vUnCom: 610, ean: "7891234567895", cest: "1200100", icms: ST },
    ]);
    const { dados: d } = await compraDoXml(xml);
    const [con, cabo] = d.produtos!;
    expect(con.produtoId).toBe("");
    expect(con.sugestoes?.[0]?.id).toBe(conector);
    expect(con.nota).toMatchObject({ ncm: "85444900", cfop: "6102", cst: "00", pIcms: 12, vIpi: 5, st: false });
    expect(cabo.nota).toMatchObject({ ean: "7891234567895", cest: "1200100", origem: "1", cst: "10", vSt: 15, st: true });
    expect(cabo.sugestoes ?? []).toHaveLength(0);
  });

  it("cadastra o produto da nota em metros (caixa de 305 m) com custo por metro e o fiscal, e a compra entra convertida", async () => {
    const p = await criarProdutoDaNota({
      fornecedorId: forn, codigoFornecedor: "F-2", codigo: "", nome: "CABO REDE CAT6 AZUL CX 305M", unidade: "MT", gtin: "7891234567895",
      converte: true, unidadeCompra: "CX", fatorConversao: "305", custoNota: "610", precoVenda: "",
      ncm: "85444900", cest: "1200100", origem: "1", cfopInterno: "5405", cfopExterno: "6404", csosn: "500", cstIcms: "60",
    }, u.id);
    const cad = await prisma.produto.findUniqueOrThrow({ where: { id: p.id }, include: { fornecedores: true, valores: true } });
    expect(cad).toMatchObject({ unidade: "MT", unidadeCompra: "CX", ncm: "85444900", cest: "1200100", origem: 1, csosn: "500", cfopInterno: "5405", gtin: "7891234567895" });
    expect(Number(cad.custo)).toBeCloseTo(2, 4);
    expect(Number(cad.fatorConversao)).toBe(305);
    expect(cad.fornecedores[0]).toMatchObject({ fornecedorId: forn, codigo: "F-2" });

    // a próxima nota do mesmo fornecedor já se liga sozinha, convertida
    const { dados: d } = await compraDoXml(xmlNfe([{ cProd: "F-2", xProd: "CABO REDE CAT6 AZUL CX 305M", uCom: "CX", qCom: 2, vUnCom: 610 }]));
    expect(d.produtos![0]).toMatchObject({ produtoId: p.id, unidadeCompra: "CX", fator: "305" });
    await cmp.salvarCompra(dados({ produtos: d.produtos! }), u);
    const saldo = await prisma.saldo.findFirst({ where: { produtoId: p.id } });
    expect(Number(saldo?.quantidade)).toBe(610);
  });

  it("completa NCM, CEST e código de barras vazios do produto ligado, sem mexer no que já está preenchido", async () => {
    await prisma.produto.update({ where: { id: conector }, data: { cest: "9999999" } });
    const { dados: d } = await compraDoXml(xmlNfe([{ cProd: "RJ45", xProd: "CONECTOR RJ45 CAT6 MACHO", uCom: "UN", qCom: 100, vUnCom: 0.9, ean: "7890000000017", cest: "1200100" }]));
    expect(d.produtos![0].produtoId).toBe(conector);
    await cmp.salvarCompra(dados({ produtos: d.produtos! }), u);
    const p = await prisma.produto.findUniqueOrThrow({ where: { id: conector } });
    expect(p).toMatchObject({ ncm: "85444900", cest: "9999999", gtin: "7890000000017" });
  });

  it("acha o XML da compra (nota recebida ou anexo) e gera o DANFE em PDF", async () => {
    const xml = xmlNfe([{ cProd: "RJ45", xProd: "CONECTOR RJ45 CAT6 MACHO", uCom: "UN", qCom: 10, vUnCom: 1 }]);
    const { dados: d } = await compraDoXml(xml);
    const c = await cmp.salvarCompra(dados({ produtos: d.produtos! }), u);
    expect(await xmlDaCompra(c.id)).toBeNull();
    await prisma.anexo.create({ data: { entidade: "COMPRA", entidadeId: c.id, nome: `NFe-${CHAVE}.xml`, tipo: "application/xml", tamanho: xml.length, dados: Buffer.from(xml) } });
    expect(await xmlDaCompra(c.id)).toBe(xml);
    await prisma.anexo.deleteMany({});
    await prisma.notaRecebida.create({ data: { chave: CHAVE, emitenteDocumento: "11222333000181", emitenteNome: "Distribuidora Alfa", emissao: new Date("2026-11-12"), valor: 10, xml } });
    expect(await xmlDaCompra(c.id)).toBe(xml);
    const pdf = await gerarDanfePdf(xml, { rodape: "DANFE gerado a partir do XML recebido" });
    expect(pdf.subarray(0, 4).toString()).toBe("%PDF");
  });
});
