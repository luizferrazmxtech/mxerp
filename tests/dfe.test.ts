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
  await prisma.configuracao.deleteMany({ where: { chave: { startsWith: "dfe" } } });
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
  it("guarda resumos e notas completas, segue até o maxNSU e, em dia, espera 1 hora", async () => {
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
    expect(await dfe.estadoDfe()).toMatchObject({ ultNSU: "000000000000003", maxNSU: "000000000000003" });

    // ficou em dia (ultNSU = maxNSU): não consulta de novo antes de 1 hora
    const nao: Transporte = async () => { throw new Error("não devia chamar"); };
    const r2 = await dfe.sincronizarDfe({ cert, transporte: nao, agora: new Date(agora.getTime() + 600_000) });
    expect(r2.aguardar).toBeTruthy();
    // depois de 1 hora: nada novo (137) → mais 1 hora de espera
    const r3 = await dfe.sincronizarDfe({ cert, transporte: t, agora: new Date(agora.getTime() + 3600_000) });
    expect(r3.mensagem).toMatch(/Nenhuma nota nova/);
    expect(pedidos.at(-1)).toBe("000000000000003");
    expect((await dfe.sincronizarDfe({ cert, transporte: nao, agora: new Date(agora.getTime() + 4000_000) })).aguardar).toBeTruthy();
  });

  it("656 não perde o último NSU e bloqueia toda consulta do CNPJ por 1 hora", async () => {
    const agora = new Date("2026-11-19T13:00:00Z");
    const pedidos: string[] = [];
    const respostas = [
      ret("138", "000000000005029", "000000000005029", [["000000000005029", "resNFe_v1.01.xsd", resNFe(CHAVE)]]),
      ret("656", "000000000000000", "000000000000000"),
      ret("138", "000000000005030", "000000000005030", [["000000000005030", "procNFe_v4.00.xsd", procNFe(CHAVE)]]),
    ];
    const t: Transporte = async (_u, _a, corpo) => { pedidos.push(corpo.match(/<ultNSU>(\d+)</)?.[1] ?? "chave"); return respostas.shift()!; };
    await dfe.sincronizarDfe({ cert, transporte: t, agora });
    const r = await dfe.sincronizarDfe({ cert, transporte: t, agora: new Date(agora.getTime() + 3600_000) });
    expect(r.aguardar).toBeTruthy();
    const est = await dfe.estadoDfe();
    expect(est).toMatchObject({ ultNSU: "000000000005029", maxNSU: "000000000005029" });
    expect(est.bloqueadaAte).toBe(new Date(agora.getTime() + 7200_000).toISOString());

    // durante o bloqueio nada vai para a SEFAZ: nem busca por NSU, nem pedido de XML por chave
    const n = await prisma.notaRecebida.update({ where: { chave: CHAVE }, data: { manifestacao: "CIENCIA", manifestadaEm: agora } });
    const meio = new Date(agora.getTime() + 5400_000);
    expect((await dfe.sincronizarDfe({ cert, transporte: t, agora: meio })).mensagem).toMatch(/bloqueou/);
    await expect(dfe.baixarXmlCompleto(n.id, { cert, transporte: t, agora: meio })).rejects.toThrow(/bloqueou/);
    expect(await dfe.baixarXmlsPendentes({ cert, transporte: t, agora: meio })).toMatchObject({ baixados: 0, aguardando: 0 });
    expect((await prisma.notaRecebida.findUniqueOrThrow({ where: { id: n.id } })).xmlTentativas).toBe(0);
    expect(pedidos).toEqual(["000000000000000", "000000000005029"]);

    // passou o bloqueio: continua do 5029 e o XML completo chega pela própria busca
    const r2 = await dfe.sincronizarDfe({ cert, transporte: t, agora: new Date(agora.getTime() + 7300_000) });
    expect(r2.novos).toBe(1);
    expect(pedidos.at(-1)).toBe("000000000005029");
    expect((await prisma.notaRecebida.findUniqueOrThrow({ where: { id: n.id } })).xml).toContain("<nfeProc");
  });
});

describe("manifestação", () => {
  it("ciência não pede o XML na hora (ele vem na busca); conclusiva não pode ser trocada", async () => {
    const n = await prisma.notaRecebida.create({ data: { chave: CHAVE, emitenteDocumento: "98765432000110", emitenteNome: "DIST", emissao: new Date(), valor: 1500 } });
    const eventos: string[] = [];
    const t: Transporte = async (url, acao, corpo) => {
      expect(acao).toMatch(/nfeRecepcaoEvento$/);
      expect(url).toContain("hom1.nfe.fazenda.gov.br/NFeRecepcaoEvento4");
      eventos.push(corpo.match(/<tpEvento>(\d+)</)![1]);
      expect(corpo).toContain("<cOrgao>91</cOrgao>");
      return `<E><retEnvEvento><cStat>128</cStat><retEvento><infEvento><cStat>135</cStat><xMotivo>Evento registrado</xMotivo><nProt>99${eventos.length}</nProt></infEvento></retEvento></retEnvEvento></E>`;
    };
    const a = await dfe.manifestar(n.id, "CIENCIA", undefined, { cert, transporte: t });
    expect(a).toMatchObject({ manifestacao: "CIENCIA", protocoloManifesto: "991", xml: null });
    const b = await dfe.manifestar(n.id, "CONFIRMADA", undefined, { cert, transporte: t });
    expect(b.manifestacao).toBe("CONFIRMADA");
    expect(eventos).toEqual(["210210", "210200"]);
    await expect(dfe.manifestar(n.id, "DESCONHECIDA", undefined, { cert, transporte: t })).rejects.toThrow(/conclusiva/);
  });
});

describe("XML depois da ciência", () => {
  it("se não chegou pela busca em 1 hora, pede pela chave de hora em hora, até a SEFAZ liberar", async () => {
    const agora = new Date("2026-11-19T13:00:00Z");
    const n = await prisma.notaRecebida.create({ data: { chave: CHAVE, emitenteDocumento: "98765432000110", emitenteNome: "DIST", emissao: new Date("2026-11-10T12:00:00Z"), valor: 1500, manifestacao: "CIENCIA", manifestadaEm: agora } });
    await prisma.notaRecebida.create({ data: { chave: CHAVE2, emitenteDocumento: "98765432000110", emitenteNome: "DIST", emissao: new Date("2026-11-10T12:00:00Z"), valor: 10 } });
    let liberado = false, pedidos = 0;
    const t: Transporte = async (_url, _acao, corpo) => {
      pedidos++;
      expect(corpo).toContain(`<chNFe>${CHAVE}</chNFe>`);
      return liberado ? ret("138", "0", "0", [["000000000000009", "procNFe_v4.00.xsd", procNFe(CHAVE)]]) : ret("138", "0", "0", [["000000000000008", "resNFe_v1.01.xsd", resNFe(CHAVE)]]);
    };
    const h = (x: number) => new Date(agora.getTime() + x * 3600_000);
    // ciência de agora: espera a busca por NSU trazer o XML
    expect(await dfe.baixarXmlsPendentes({ cert, transporte: t, agora })).toMatchObject({ baixados: 0, aguardando: 0 });
    expect(await dfe.baixarXmlsPendentes({ cert, transporte: t, agora: h(1) })).toMatchObject({ baixados: 0, aguardando: 1 });
    // dentro da mesma hora não pede de novo
    expect(await dfe.baixarXmlsPendentes({ cert, transporte: t, agora: h(1.2) })).toMatchObject({ baixados: 0, aguardando: 0 });
    liberado = true;
    expect(await dfe.baixarXmlsPendentes({ cert, transporte: t, agora: h(2) })).toMatchObject({ baixados: 1, aguardando: 0 });
    expect(pedidos).toBe(2);
    expect(await prisma.notaRecebida.findUniqueOrThrow({ where: { id: n.id } })).toMatchObject({ xmlTentativas: 2 });
    expect((await prisma.notaRecebida.findUniqueOrThrow({ where: { id: n.id } })).xml).toContain("<nfeProc");
    // prazo de 180 dias da emissão
    expect(dfe.diasParaManifestar(new Date("2026-11-10T12:00:00Z"), agora)).toBe(170);
    expect(dfe.diasParaManifestar(new Date("2026-05-01T12:00:00Z"), agora)).toBeLessThan(0);
  });

  it("não passa do limite de pedidos por chave na hora", async () => {
    const agora = new Date("2026-11-19T13:00:00Z");
    const ids: string[] = [];
    for (let i = 0; i < dfe.LIMITE_CHAVES_HORA + 2; i++) {
      const chave = CHAVE.slice(0, 30) + String(i).padStart(14, "0");
      ids.push((await prisma.notaRecebida.create({ data: { chave, emitenteDocumento: "1", emitenteNome: "D", emissao: agora, valor: 1, manifestacao: "CIENCIA", manifestadaEm: agora } })).id);
    }
    let pedidos = 0;
    const t: Transporte = async () => { pedidos++; return ret("138", "0", "0", [["000000000000008", "resNFe_v1.01.xsd", resNFe(CHAVE)]]); };
    for (const id of ids.slice(0, dfe.LIMITE_CHAVES_HORA)) await expect(dfe.baixarXmlCompleto(id, { cert, transporte: t, agora })).rejects.toThrow(/só o resumo/);
    await expect(dfe.baixarXmlCompleto(ids.at(-1)!, { cert, transporte: t, agora })).rejects.toThrow(/limite/);
    expect(pedidos).toBe(dfe.LIMITE_CHAVES_HORA);
    // 1 hora depois libera de novo
    await expect(dfe.baixarXmlCompleto(ids.at(-1)!, { cert, transporte: t, agora: new Date(agora.getTime() + 3601_000) })).rejects.toThrow(/só o resumo/);
  });
});
