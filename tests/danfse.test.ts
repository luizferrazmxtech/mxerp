import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { execSync } from "node:child_process";
import { pfxDeTeste } from "./helpers/certificado-teste";

const URL = "postgresql://mxerp:mxerp@localhost:5432/mxerp_test?schema=public";
process.env.DATABASE_URL = URL;

const { prisma } = await import("@/lib/db");
const { lerCertificado } = await import("@/lib/fiscal/certificado");
const { danfseDaNota, lerNfse } = await import("@/lib/fiscal/danfse");

const { pfx, senha } = pfxDeTeste();
const cert = lerCertificado(pfx, senha);
const CHAVE = "35489062236130603000155000000000002782611849262711";
const XML = `<?xml version="1.0" encoding="UTF-8"?><NFSe xmlns="http://www.sped.fazenda.gov.br/nfse" versao="1.00"><infNFSe Id="NFS${CHAVE}">
<xLocEmi>São Carlos</xLocEmi><xLocPrestacao>São Carlos</xLocPrestacao><nNFSe>279</nNFSe><xTribNac>Instalação e manutenção</xTribNac><dhProc>2026-11-24T22:43:00-03:00</dhProc>
<emit><CNPJ>36130603000155</CNPJ><xNome>VFX INFO SERVICE LTDA</xNome><enderNac><xLgr>Rua A</xLgr><nro>10</nro><xBairro>Centro</xBairro><UF>SP</UF><CEP>13560000</CEP></enderNac></emit>
<valores><vLiq>320.00</vLiq></valores>
<DPS versao="1.00"><infDPS Id="DPS1"><dCompet>2026-11-24</dCompet><serie>900</serie><nDPS>279</nDPS>
<toma><CNPJ>11222333000181</CNPJ><xNome>CONDOMINIO RESIDENCIAL SAINT PAUL</xNome></toma>
<serv><cServ><cTribNac>140101</cTribNac><xDescServ>Mão de obra técnica</xDescServ></cServ></serv>
<valores><vServPrest><vServ>320.00</vServ></vServPrest><trib><tribMun><tribISSQN>1</tribISSQN><tpRetISSQN>1</tpRetISSQN></tribMun></trib></valores></infDPS></DPS></infNFSe></NFSe>`;

let notaId = "";
beforeAll(() => { execSync("npx prisma migrate deploy", { env: { ...process.env, DATABASE_URL: URL }, stdio: "ignore" }); });
const limpar = () => prisma.$executeRawUnsafe(`TRUNCATE "NotaFiscal","Empresa" CASCADE`);
afterAll(limpar);
beforeEach(async () => {
  await limpar();
  const vfx = await prisma.empresa.create({ data: { razaoSocial: "VFX INFO SERVICE LTDA", nomeFantasia: "VFX", cnpj: "36130603000155" } });
  notaId = (await prisma.notaFiscal.create({ data: { empresaId: vfx.id, modelo: "NFSE", serie: 900, numero: 279, ambiente: "PRODUCAO", status: "AUTORIZADA", chave: CHAVE, valorTotal: 320, xml: XML } })).id;
});

describe("DANFSe", () => {
  it("baixa o PDF oficial do ADN com o certificado da empresa emissora", async () => {
    let url = "", usado: unknown = null;
    const d = await danfseDaNota(notaId, { oficial: true, cert, transporte: async (u, c) => { url = u; usado = c; return { status: 200, tipo: "application/pdf", corpo: Buffer.from("%PDF-1.7 oficial") }; } });
    expect(url).toBe(`https://adn.nfse.gov.br/danfse/${CHAVE}`);
    expect(usado).toBe(cert);
    expect(d).toMatchObject({ oficial: true, nome: `DANFSe-279-${CHAVE}.pdf` });
    expect(d.pdf.toString()).toContain("oficial");
  });

  it("ADN fora do ar (503) ou com erro de rede: gera a representação do XML", async () => {
    const d = await danfseDaNota(notaId, { oficial: true, cert, transporte: async () => ({ status: 503, tipo: "text/html", corpo: Buffer.from("<h1>503 Service Unavailable</h1>") }) });
    expect(d.oficial).toBe(false);
    expect(d.motivo).toMatch(/indisponível \(HTTP 503\)/);
    expect(d.pdf.subarray(0, 5).toString()).toBe("%PDF-");
    const r = await danfseDaNota(notaId, { oficial: true, cert, transporte: async () => { throw new Error("ECONNRESET"); } });
    expect(r).toMatchObject({ oficial: false, motivo: "ECONNRESET" });
  });

  it("por padrão monta o DANFSe do MXERP sem ir ao portal", async () => {
    let chamou = false;
    const d = await danfseDaNota(notaId, { cert, transporte: async () => { chamou = true; return { status: 200, tipo: "application/pdf", corpo: Buffer.from("%PDF-x") }; } });
    expect(chamou).toBe(false);
    expect(d).toMatchObject({ oficial: false, motivo: undefined });
    expect(d.pdf.subarray(0, 5).toString()).toBe("%PDF-");
  });

  it("lê os dados da NFS-e autorizada", () => {
    const d = lerNfse(XML);
    expect(d).toMatchObject({ chave: CHAVE, numero: "279", emitente: { doc: "36130603000155", nome: "VFX INFO SERVICE LTDA" }, tomador: { nome: "CONDOMINIO RESIDENCIAL SAINT PAUL" } });
    expect(d.valores).toMatchObject({ servico: "320.00", liquido: "320.00" });
    expect(d.servico.descricao).toBe("Mão de obra técnica");
  });
});
