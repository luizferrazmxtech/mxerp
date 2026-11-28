import { beforeAll, beforeEach, describe, expect, it } from "vitest";
import { execSync } from "node:child_process";

const URL = "postgresql://mxerp:mxerp@localhost:5432/mxerp_test?schema=public";
process.env.DATABASE_URL = URL;

const { prisma } = await import("@/lib/db");
const st = await import("@/lib/fiscal/st");

const CHAVE = "35261198765432000110550010000123451000123450";
const det = (n: number, cProd: string, xProd: string, icms: string, extra = "", cfop = "5102", ean = "SEM GTIN") =>
  `<det nItem="${n}"><prod><cProd>${cProd}</cProd><cEAN>${ean}</cEAN><xProd>${xProd}</xProd><NCM>85444200</NCM>${extra}<CFOP>${cfop}</CFOP><uCom>UN</uCom><qCom>1</qCom><vUnCom>10</vUnCom></prod><imposto><ICMS>${icms}</ICMS></imposto></det>`;
const nota = (dets: string, chave = CHAVE) =>
  `<nfeProc xmlns="http://www.portalfiscal.inf.br/nfe" versao="4.00"><NFe><infNFe Id="NFe${chave}" versao="4.00"><ide><nNF>12345</nNF><dhEmi>2026-11-10T09:00:00-03:00</dhEmi></ide><emit><CNPJ>98765432000110</CNPJ><xNome>DISTRIBUIDORA LTDA</xNome></emit>${dets}</infNFe></NFe></nfeProc>`;

beforeAll(() => execSync("npx prisma migrate deploy", { env: { ...process.env, DATABASE_URL: URL }, stdio: "ignore" }));

describe("lerNotaSt", () => {
  it("reconhece ST por CSOSN, CST, CFOP e valor de ST", () => {
    const n = st.lerNotaSt(nota([
      det(1, "A", "CABO", "<ICMSSN500><orig>0</orig><CSOSN>500</CSOSN></ICMSSN500>", "<CEST>1200100</CEST>"),
      det(2, "B", "CONECTOR", "<ICMS60><orig>0</orig><CST>60</CST></ICMS60>"),
      det(3, "C", "FITA", "<ICMSSN102><orig>0</orig><CSOSN>102</CSOSN></ICMSSN102>", "", "5405"),
      det(4, "D", "PARAFUSO", "<ICMS00><orig>0</orig><CST>00</CST></ICMS00>"),
      det(5, "E", "TOMADA", "<ICMS90><orig>0</orig><CST>90</CST><vICMSST>3.50</vICMSST></ICMS90>"),
    ].join("")))!;
    expect(n.itens.map((i) => i.motivoSt)).toEqual(["CSOSN 500", "CST 60", "CFOP 5405", null, "valor de ICMS-ST no item"]);
    expect(n.itens[0].cest).toBe("1200100");
    expect(n.emitenteDocumento).toBe("98765432000110");
  });
  it("devolve null para XML que não é NF-e", () => {
    expect(st.lerNotaSt("<qualquer/>")).toBeNull();
  });
});

describe("analisarSt / aplicarSt", () => {
  beforeEach(async () => {
    await prisma.$executeRawUnsafe(`TRUNCATE "NotaRecebida","Empresa","ItemFornecedor","Produto","Pessoa" CASCADE`);
  });

  it("liga itens pelo código do fornecedor, código de barras e nome; aplica e desfaz a regra", async () => {
    const emp = await prisma.empresa.create({ data: { razaoSocial: "MXTECH", cnpj: "12965283000195" } });
    const forn = await prisma.pessoa.create({ data: { nome: "DISTRIBUIDORA LTDA", documento: "98765432000110", fornecedor: true } });
    const cabo = await prisma.produto.create({ data: { codigo: "P1", nome: "CABO DE REDE", cfopInterno: "5102" } });
    const conector = await prisma.produto.create({ data: { codigo: "P2", nome: "CONECTOR RJ45", gtin: "7891234567895", ncm: "85444200" } });
    const fita = await prisma.produto.create({ data: { codigo: "P3", nome: "FITA ISOLANTE" } });
    const parafuso = await prisma.produto.create({ data: { codigo: "P4", nome: "PARAFUSO" } });
    const outroNcm = await prisma.produto.create({ data: { codigo: "P5", nome: "CABO COAXIAL", ncm: "85444200" } });
    const comCest = await prisma.produto.create({ data: { codigo: "P6", nome: "LAMPADA", cest: "0900500" } });
    await prisma.produto.create({ data: { codigo: "P7", nome: "SEM NADA" } });
    await prisma.itemFornecedor.create({ data: { produtoId: cabo.id, fornecedorId: forn.id, codigo: "A" } });
    await prisma.notaRecebida.create({ data: {
      empresaId: emp.id, chave: CHAVE, emitenteDocumento: forn.documento!, emitenteNome: forn.nome, emissao: new Date("2026-11-10"), valor: 50,
      xml: nota([
        det(1, "A", "CABO UTP CAT6 CX 305M", "<ICMSSN500><orig>0</orig><CSOSN>500</CSOSN></ICMSSN500>", "<CEST>1200100</CEST>"),
        det(2, "X", "RJ45 CAT6", "<ICMS60><orig>0</orig><CST>60</CST></ICMS60>", "", "5102", "7891234567895"),
        det(3, "Y", "fita isolante", "<ICMSSN102><orig>0</orig><CSOSN>102</CSOSN></ICMSSN102>", "", "5405"),
        det(4, "Z", "PARAFUSO", "<ICMS00><orig>0</orig><CST>00</CST></ICMS00>"),
        det(5, "W", "ITEM SEM CADASTRO", "<ICMS60><orig>0</orig><CST>60</CST></ICMS60>"),
      ].join("")),
    } });
    // nota de outra loja não entra
    const outra = await prisma.empresa.create({ data: { razaoSocial: "VFX", cnpj: "36130603000155" } });
    await prisma.notaRecebida.create({ data: { empresaId: outra.id, chave: CHAVE.replace(/0$/, "9"), emitenteDocumento: forn.documento!, emitenteNome: forn.nome, emissao: new Date(), valor: 1,
      xml: nota(det(1, "Z", "PARAFUSO", "<ICMS60><orig>0</orig><CST>60</CST></ICMS60>"), CHAVE.replace(/0$/, "9")) } });

    const a = await st.analisarSt(emp.id);
    expect(a.notasLidas).toBe(1);
    expect(a.itensComSt).toBe(4);
    const porId = new Map(a.produtos.map((p) => [p.id, p]));
    expect(porId.get(cabo.id)?.fonte).toBe("NOTA");
    expect(porId.get(cabo.id)?.ncmNota).toBe("85444200");
    expect(porId.get(cabo.id)?.cestNota).toBe("1200100");
    expect(porId.get(conector.id)?.fonte).toBe("NOTA");
    expect(porId.get(fita.id)?.fonte).toBe("NOTA");
    expect(porId.has(parafuso.id)).toBe(false); // veio sem ST
    expect(porId.get(outroNcm.id)?.fonte).toBe("NCM");
    expect(porId.get(comCest.id)?.fonte).toBe("CEST");
    expect(a.produtos).toHaveLength(5);
    expect(a.itensSemVinculo.map((i) => i.item)).toEqual(["W ITEM SEM CADASTRO"]);

    await st.aplicarSt([cabo.id, conector.id], { [cabo.id]: { ncm: "85444200", cest: "1200100" } });
    const c = await prisma.produto.findUniqueOrThrow({ where: { id: cabo.id } });
    expect([c.cfopInterno, c.cfopExterno, c.csosn, c.cstIcms, c.ncm, c.cest]).toEqual(["5405", "6404", "500", "60", "85444200", "1200100"]);
    const depois = await st.analisarSt(emp.id);
    expect(depois.produtos.find((p) => p.id === cabo.id)?.ajustado).toBe(true);

    await st.removerSt([cabo.id]);
    const r = await prisma.produto.findUniqueOrThrow({ where: { id: cabo.id } });
    expect([r.cfopInterno, r.cfopExterno, r.csosn, r.cstIcms, r.ncm]).toEqual([null, null, null, null, "85444200"]);
  });
});

describe("stRetidoDosProdutos", () => {
  beforeEach(async () => {
    await prisma.$executeRawUnsafe(`TRUNCATE "NotaRecebida","Empresa","ItemFornecedor","Produto","Pessoa" CASCADE`);
  });

  it("pega o ST da compra mais recente, por unidade do produto (caixa → metro) e guarda no produto", async () => {
    const emp = await prisma.empresa.create({ data: { razaoSocial: "MXTECH", cnpj: "12965283000195" } });
    const cabo = await prisma.produto.create({ data: { codigo: "P1", nome: "CABO UTP", unidade: "MT", unidadeCompra: "CX", fatorConversao: 305, csosn: "500" } });
    const tomada = await prisma.produto.create({ data: { codigo: "P2", nome: "TOMADA", gtin: "7891234567895" } });
    const ret = (b: number, v: number) => `<ICMSSN500><orig>0</orig><CSOSN>500</CSOSN><vBCSTRet>${b}</vBCSTRet><pST>18.00</pST><vICMSSubstituto>${v / 2}</vICMSSubstituto><vICMSSTRet>${v}</vICMSSTRet></ICMSSN500>`;
    const qdet = (n: number, x: string, icms: string, q: number, u: string, ean = "SEM GTIN") =>
      `<det nItem="${n}"><prod><cProd>${n}</cProd><cEAN>${ean}</cEAN><xProd>${x}</xProd><NCM>85444200</NCM><CFOP>5405</CFOP><uCom>${u}</uCom><qCom>${q}</qCom><vUnCom>10</vUnCom></prod><imposto><ICMS>${icms}</ICMS></imposto></det>`;
    const ch1 = CHAVE, ch2 = CHAVE.replace(/0$/, "1");
    await prisma.notaRecebida.create({ data: { empresaId: emp.id, chave: ch1, emitenteDocumento: "98765432000110", emitenteNome: "D", emissao: new Date("2026-10-01"), valor: 1,
      xml: nota(qdet(1, "CABO UTP", ret(100, 9), 1, "CX"), ch1) } });
    await prisma.notaRecebida.create({ data: { empresaId: emp.id, chave: ch2, emitenteDocumento: "98765432000110", emitenteNome: "D", emissao: new Date("2026-11-01"), valor: 1,
      xml: nota(qdet(1, "CABO UTP", ret(610, 61), 2, "CX") + qdet(2, "TOMADA 10A", "<ICMS10><orig>0</orig><CST>10</CST><modBC>3</modBC><vBC>40</vBC><pICMS>18</pICMS><vICMS>7.2</vICMS><modBCST>4</modBCST><vBCST>60</vBCST><pICMSST>18</pICMSST><vICMSST>3.6</vICMSST></ICMS10>", 4, "UN", "7891234567895"), ch2) } });

    const m = await st.stRetidoDosProdutos([cabo.id, tomada.id], emp.id);
    const c = m.get(cabo.id)!;
    expect(c.nota).toBe("12345");
    expect(c.vBCSTRet).toBeCloseTo(610 / 610); // 2 caixas × 305 m
    expect(c.vICMSSTRet).toBeCloseTo(0.1);
    expect(c.pST).toBe(18);
    const t = m.get(tomada.id)!;
    expect([t.vBCSTRet, t.vICMSSTRet, t.vICMSSubstituto, t.pST]).toEqual([15, 0.9, 1.8, 18]);
    const salvo = await prisma.produto.findUniqueOrThrow({ where: { id: cabo.id } });
    expect((salvo.stRetido as { chave: string }).chave).toBe(ch2);
  });
});

