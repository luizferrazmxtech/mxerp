import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { execSync } from "node:child_process";

const URL = "postgresql://mxerp:mxerp@localhost:5432/mxerp_test?schema=public";
process.env.DATABASE_URL = URL;

const { prisma } = await import("@/lib/db");
const { limparCacheLojas } = await import("@/lib/empresa/loja");
const { lerCertificado } = await import("@/lib/fiscal/certificado");
const { gzipB64 } = await import("@/lib/fiscal/nfse");
const { completarNfse, deveBuscarXml } = await import("@/lib/fiscal/xmlNfse");
const { rotuloNota } = await import("@/lib/fiscal/numeroNota");
const { pfxDeTeste } = await import("./helpers/certificado-teste");
type TransporteRest = import("@/lib/fiscal/nfse").TransporteRest;

const { pfx, senha } = pfxDeTeste("36130603000155");
const cert = lerCertificado(pfx, senha);
const CHAVE = "35489062236130603000155000000000027126110000000001";
const XML = `<NFSe xmlns="http://www.sped.fazenda.gov.br/nfse"><infNFSe Id="NFS${CHAVE}"><nNFSe>271</nNFSe></infNFSe></NFSe>`;
let vfx = "";

beforeAll(() => { execSync("npx prisma migrate deploy", { env: { ...process.env, DATABASE_URL: URL }, stdio: "ignore" }); });
const limpar = async () => { await prisma.$executeRawUnsafe(`TRUNCATE "Empresa","NotaFiscal" CASCADE`); limparCacheLojas(); };
afterAll(limpar);
beforeEach(async () => {
  await limpar();
  vfx = (await prisma.empresa.create({ data: { razaoSocial: "VFX INFO SERVICE LTDA", cnpj: "36130603000155", codigoMunicipio: "3548906" } })).id;
});

const notaGc = () => prisma.notaFiscal.create({ data: {
  empresaId: vfx, modelo: "NFSE", serie: 900, numero: 272, numeroNfse: 300, ambiente: "PRODUCAO", status: "AUTORIZADA", valorTotal: 2600,
  idLegado: "36130603000155:nota:NFSE:900:272:PRODUCAO", motivo: "Emitida no Gestão Click (NFS-e nº 300)",
} });

describe("NFS-e emitida fora do MXERP: XML pelo portal nacional", () => {
  it("acha a chave pela DPS, baixa o XML e corrige o número da nota", async () => {
    const n = await notaGc();
    const urls: string[] = [];
    const transporte: TransporteRest = async (metodo, url) => {
      urls.push(`${metodo} ${url}`);
      if (url.includes("/dps/")) return { status: 200, corpo: JSON.stringify({ chaveAcesso: CHAVE }) };
      return { status: 200, corpo: JSON.stringify({ chaveAcesso: CHAVE, nfseXmlGZipB64: gzipB64(XML) }) };
    };
    expect(deveBuscarXml(n)).toBe(true);
    const r = await completarNfse(n.id, { cert, transporte });
    expect(r.ok).toBe(true);
    // id da DPS: DPS + município + 2 (CNPJ) + CNPJ + série(5) + número(15)
    expect(urls).toEqual([
      "GET https://sefin.nfse.gov.br/SefinNacional/dps/DPS354890623613060300015500900000000000000272",
      `GET https://sefin.nfse.gov.br/SefinNacional/nfse/${CHAVE}`,
    ]);
    const d = await prisma.notaFiscal.findUniqueOrThrow({ where: { id: n.id } });
    expect(d.chave).toBe(CHAVE);
    expect(d.xml).toContain("<nNFSe>271</nNFSe>");
    expect(d.numeroNfse).toBe(271);
    expect(rotuloNota(d)).toBe("NFS-e nº 271");
    expect(deveBuscarXml(d)).toBe(false);
  });

  it("portal fora do ar: guarda a tentativa e não tenta de novo antes de 1 hora", async () => {
    const n = await notaGc();
    const r = await completarNfse(n.id, { cert, transporte: async () => ({ status: 503, corpo: "" }) });
    expect(r.ok).toBe(false);
    expect(r.mensagem).toContain("HTTP 503");
    const d = await prisma.notaFiscal.findUniqueOrThrow({ where: { id: n.id } });
    expect(d.chave).toBeNull();
    expect(deveBuscarXml(d)).toBe(false);
    expect(deveBuscarXml(d, new Date(Date.now() + 2 * 3600_000))).toBe(true);
  });

  it("mesmo nome em todas as telas", () => {
    expect(rotuloNota({ modelo: "NFE", numero: 1234 })).toBe("NF-e nº 1234");
    expect(rotuloNota({ modelo: "NFCE", numero: 56 })).toBe("NFC-e nº 56");
    expect(rotuloNota({ modelo: "NFSE", numero: 279, numeroNfse: 278 })).toBe("NFS-e nº 278");
  });
});
