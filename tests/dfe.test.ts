import { beforeAll, beforeEach, describe, expect, it } from "vitest";
import { execFileSync, execSync } from "node:child_process";
import { gzipSync } from "node:zlib";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { pfxDeTeste } from "./helpers/certificado-teste";

const URL = "postgresql://mxerp:mxerp@localhost:5432/mxerp_test?schema=public";
process.env.DATABASE_URL = URL;

const { prisma } = await import("@/lib/db");
const { lerCertificado } = await import("@/lib/fiscal/certificado");
const dfe = await import("@/lib/fiscal/dfe");
const { assinarXml } = await import("@/lib/fiscal/assinatura");
type Transporte = import("@/lib/fiscal/sefaz").Transporte;

const { pfx, senha } = pfxDeTeste();
const cert = lerCertificado(pfx, senha);
const CHAVE = "35261198765432000110550010000123451000123450";
const CHAVE2 = "35261198765432000110550010000123461000123461";

function xsd(xml: string, schema: string) {
  const f = path.join(fs.mkdtempSync(path.join(os.tmpdir(), "dfe-")), "x.xml");
  fs.writeFileSync(f, xml);
  try { execFileSync("xmllint", ["--noout", "--schema", path.resolve("fiscal-schemas/nfe", schema), f], { stdio: "pipe" }); return "ok"; }
  catch (e) { return String((e as { stderr?: Buffer }).stderr ?? e); }
}
const zip = (xml: string) => gzipSync(Buffer.from(xml)).toString("base64");
const resNFe = (chave: string, v = "1500.00", cSit = 1) =>
  `<resNFe xmlns="http://www.portalfiscal.inf.br/nfe" versao="1.01"><chNFe>${chave}</chNFe><CNPJ>98765432000110</CNPJ><xNome>DISTRIBUIDORA DE CABOS LTDA</xNome><IE>123456789</IE><dhEmi>2026-11-10T09:00:00-03:00</dhEmi><tpNF>1</tpNF><vNF>${v}</vNF><digVal>abc=</digVal><dhRecbto>2026-11-10T09:00:05-03:00</dhRecbto><nProt>135260000000001</nProt><cSitNFe>${cSit}</cSitNFe></resNFe>`;
const procNFe = (chave: string) =>
  `<nfeProc xmlns="http://www.portalfiscal.inf.br/nfe" versao="4.00"><NFe><infNFe Id="NFe${chave}" versao="4.00"><ide><nNF>12345</nNF><dhEmi>2026-11-10T09:00:00-03:00</dhEmi><tpNF>1</tpNF></ide><emit><CNPJ>98765432000110</CNPJ><xNome>DISTRIBUIDORA DE CABOS LTDA</xNome><IE>123456789</IE></emit><total><ICMSTot><vNF>1500.00</vNF></ICMSTot></total></infNFe></NFe><protNFe versao="4.00"><infProt><chNFe>${chave}</chNFe><nProt>135260000000001</nProt><cStat>100</cStat></infProt></protNFe></nfeProc>`;
const ret = (cStat: string, ult: string, max: string, docs: [string, string, string][] = []) =>
  `<soap:Envelope><soap:Body><nfeDistDFeInteresseResponse><nfeDistDFeInteresseResult><retDistDFeInt xmlns="http://www.portalfiscal.inf.br/nfe" versao="1.01"><tpAmb>2</tpAmb><cStat>${cStat}</cStat><xMotivo>Motivo ${cStat}</xMotivo><dhResp>2026-11-19T10:00:00-03:00</dhResp><ultNSU>${ult}</ultNSU><maxNSU>${max}</maxNSU>${docs.length ? `<loteDistDFeInt>${docs.map(([nsu, sch, x]) => `<docZip NSU="${nsu}" schema="${sch}">${zip(x)}</docZip>`).join("")}</loteDistDFeInt>` : ""}</retDistDFeInt></nfeDistDFeInteresseResult></nfeDistDFeInteresseResponse></soap:Body></soap:Envelope>`;

beforeAll(() => execSync("npx prisma migrate deploy", { env: { ...process.env, DATABASE_URL: URL }, stdio: "ignore" }));

beforeEach(async () => {
  await prisma.$executeRawUnsafe(`TRUNCATE "NotaRecebida","Empresa","Sequencia" CASCADE`);
  await prisma.configuracao.deleteMany({ where: { chave: "dfe" } });
  await prisma.empresa.create({ data: {
    razaoSocial: "MXTECH TESTE LTDA", cnpj: "12345678000195", inscricaoEstadual: "111111111111", logradouro: "Rua A", numero: "1",
    bairro: "Centro", cidade: "São Carlos", codigoMunicipio: "3548906", uf: "SP", cep: "13560000",
  } });
});

describe("XML enviado à SEFAZ", () => {
  it("pedido de distribuição e manifestação são válidos nos schemas", () => {
    expect(xsd(dfe.montarDistribuicao({ tpAmb: 2, uf: "SP", cnpj: "12345678000195", ultNSU: "42" }), "distDFeInt_v1.01.xsd")).toBe("ok");
    expect(xsd(dfe.montarDistribuicao({ tpAmb: 2, uf: "SP", cnpj: "12345678000195", chave: CHAVE }), "distDFeInt_v1.01.xsd")).toBe("ok");
    for (const tipo of ["CIENCIA", "CONFIRMADA", "DESCONHECIDA", "NAO_REALIZADA"] as const) {
      const ev = dfe.montarManifestacao({ chave: CHAVE, tipo, cnpj: "12345678000195", tpAmb: 2, justificativa: "Mercadoria nunca foi entregue" });
      const env = `<envEvento xmlns="http://www.portalfiscal.inf.br/nfe" versao="1.00"><idLote>1</idLote>${assinarXml(ev, cert, { tag: "infEvento", pai: "evento" })}</envEvento>`;
      expect(xsd(env, "envConfRecebto_v1.00.xsd")).toBe("ok");
    }
    expect(() => dfe.montarManifestacao({ chave: CHAVE, tipo: "NAO_REALIZADA", cnpj: "1", tpAmb: 2 })).toThrow(/15 caracteres/);
  });
});

describe("sincronização", () => {
  it("guarda resumos e notas completas, segue até o maxNSU e espera 1 hora quando não há nada novo", async () => {
    const pedidos: string[] = [];
    const respostas = [
      ret("138", "000000000000002", "000000000000003", [["000000000000001", "resNFe_v1.01.xsd", resNFe(CHAVE)], ["000000000000002", "procNFe_v4.00.xsd", procNFe(CHAVE2)]]),
      ret("138", "000000000000003", "000000000000003", [["000000000000003", "resEvento_v1.01.xsd", `<resEvento xmlns="http://www.portalfiscal.inf.br/nfe" versao="1.01"><chNFe>${CHAVE2}</chNFe><tpEvento>110111</tpEvento></resEvento>`]]),
      ret("137", "000000000000003", "000000000000003"),
    ];
    const t: Transporte = async (url, acao, corpo) => {
      expect(url).toContain("hom1.nfe.fazenda.gov.br/NFeDistribuicaoDFe");
      expect(acao).toMatch(/nfeDistDFeInteresse$/);
      pedidos.push(corpo.match(/<ultNSU>(\d+)</)![1]);
      return respostas.shift()!;
    };
    const agora = new Date("2026-11-19T13:00:00Z");
    const r = await dfe.sincronizarDfe({ cert, transporte: t, agora });
    expect(r.novos).toBe(3);
    expect(pedidos).toEqual(["000000000000000", "000000000000002"]);
    const notas = await prisma.notaRecebida.findMany({ orderBy: { chave: "asc" } });
    expect(notas.map((n) => [n.chave, Number(n.valor), n.situacao, !!n.xml])).toEqual([[CHAVE, 1500, "AUTORIZADA", false], [CHAVE2, 1500, "CANCELADA", true]]);
    expect((await dfe.estadoDfe()).ultNSU).toBe("000000000000003");

    // próxima: nada novo (137) → bloqueia por 1 hora sem chamar a SEFAZ de novo
    const r2 = await dfe.sincronizarDfe({ cert, transporte: t, agora });
    expect(r2.mensagem).toMatch(/Nenhuma nota nova/);
    const r3 = await dfe.sincronizarDfe({ cert, transporte: async () => { throw new Error("não devia chamar"); }, agora: new Date(agora.getTime() + 600_000) });
    expect(r3.aguardar).toBeTruthy();
  });
});

describe("manifestação", () => {
  it("ciência baixa o XML completo; conclusiva não pode ser trocada", async () => {
    const n = await prisma.notaRecebida.create({ data: { chave: CHAVE, emitenteDocumento: "98765432000110", emitenteNome: "DIST", emissao: new Date(), valor: 1500 } });
    const eventos: string[] = [];
    const t: Transporte = async (url, acao, corpo) => {
      if (acao.endsWith("nfeRecepcaoEvento")) {
        expect(url).toContain("hom1.nfe.fazenda.gov.br/NFeRecepcaoEvento4");
        eventos.push(corpo.match(/<tpEvento>(\d+)</)![1]);
        expect(corpo).toContain("<cOrgao>91</cOrgao>");
        return `<E><retEnvEvento><cStat>128</cStat><retEvento><infEvento><cStat>135</cStat><xMotivo>Evento registrado</xMotivo><nProt>99${eventos.length}</nProt></infEvento></retEvento></retEnvEvento></E>`;
      }
      expect(corpo).toContain(`<chNFe>${CHAVE}</chNFe>`);
      return ret("138", "0", "0", [["000000000000009", "procNFe_v4.00.xsd", procNFe(CHAVE)]]);
    };
    const a = await dfe.manifestar(n.id, "CIENCIA", undefined, { cert, transporte: t });
    expect(a).toMatchObject({ manifestacao: "CIENCIA", protocoloManifesto: "991" });
    expect(a.xml).toContain("<nfeProc");
    const b = await dfe.manifestar(n.id, "CONFIRMADA", undefined, { cert, transporte: t });
    expect(b.manifestacao).toBe("CONFIRMADA");
    expect(eventos).toEqual(["210210", "210200"]);
    await expect(dfe.manifestar(n.id, "DESCONHECIDA", undefined, { cert, transporte: t })).rejects.toThrow(/conclusiva/);
  });
});

describe("XML depois da ciência", () => {
  it("o agendador pede de novo o XML de hora em hora, até a SEFAZ liberar", async () => {
    const agora = new Date("2026-11-19T13:00:00Z");
    const n = await prisma.notaRecebida.create({ data: { chave: CHAVE, emitenteDocumento: "98765432000110", emitenteNome: "DIST", emissao: new Date("2026-11-10T12:00:00Z"), valor: 1500, manifestacao: "CIENCIA", manifestadaEm: agora } });
    await prisma.notaRecebida.create({ data: { chave: CHAVE2, emitenteDocumento: "98765432000110", emitenteNome: "DIST", emissao: new Date("2026-11-10T12:00:00Z"), valor: 10 } });
    let liberado = false, pedidos = 0;
    const t: Transporte = async (_url, _acao, corpo) => {
      pedidos++;
      expect(corpo).toContain(`<chNFe>${CHAVE}</chNFe>`);
      return liberado ? ret("138", "0", "0", [["000000000000009", "procNFe_v4.00.xsd", procNFe(CHAVE)]]) : ret("138", "0", "0", [["000000000000008", "resNFe_v1.01.xsd", resNFe(CHAVE)]]);
    };
    expect(await dfe.baixarXmlsPendentes({ cert, transporte: t, agora })).toEqual({ baixados: 0, aguardando: 1 });
    // dentro da mesma hora não pede de novo
    expect(await dfe.baixarXmlsPendentes({ cert, transporte: t, agora: new Date(agora.getTime() + 600_000) })).toEqual({ baixados: 0, aguardando: 0 });
    liberado = true;
    expect(await dfe.baixarXmlsPendentes({ cert, transporte: t, agora: new Date(agora.getTime() + 3600_000) })).toEqual({ baixados: 1, aguardando: 0 });
    expect(pedidos).toBe(2);
    expect(await prisma.notaRecebida.findUniqueOrThrow({ where: { id: n.id } })).toMatchObject({ xmlTentativas: 2 });
    expect((await prisma.notaRecebida.findUniqueOrThrow({ where: { id: n.id } })).xml).toContain("<nfeProc");
    // prazo de 180 dias da emissão
    expect(dfe.diasParaManifestar(new Date("2026-11-10T12:00:00Z"), agora)).toBe(170);
    expect(dfe.diasParaManifestar(new Date("2026-05-01T12:00:00Z"), agora)).toBeLessThan(0);
  });
});
