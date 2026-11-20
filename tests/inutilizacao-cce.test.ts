import { beforeAll, beforeEach, describe, expect, it } from "vitest";
import { execFileSync, execSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { pfxDeTeste } from "./helpers/certificado-teste";

const URL = "postgresql://mxerp:mxerp@localhost:5432/mxerp_test?schema=public";
process.env.DATABASE_URL = URL;

const { prisma } = await import("@/lib/db");
const { lerCertificado } = await import("@/lib/fiscal/certificado");
const inut = await import("@/lib/fiscal/inutilizacao");
const { montarInutilizacao, montarCartaCorrecao } = await import("@/lib/fiscal/sefaz");
type Transporte = import("@/lib/fiscal/sefaz").Transporte;

const { pfx, senha } = pfxDeTeste();
const cert = lerCertificado(pfx, senha);
const CHAVE = "35270112345678000195550010000000071876543210";

function xsd(xml: string, schema: string) {
  const f = path.join(fs.mkdtempSync(path.join(os.tmpdir(), "inut-")), "x.xml");
  fs.writeFileSync(f, xml);
  try { execFileSync("xmllint", ["--noout", "--schema", path.resolve("fiscal-schemas/nfe", schema), f], { stdio: "pipe" }); return "ok"; }
  catch (e) { return String((e as { stderr?: Buffer }).stderr ?? e); }
}
const corpoDe = (soap: string) => soap.match(/<nfeDadosMsg[^>]*>([\s\S]*)<\/nfeDadosMsg>/)![1];

beforeAll(() => execSync("npx prisma migrate deploy", { env: { ...process.env, DATABASE_URL: URL }, stdio: "ignore" }));

beforeEach(async () => {
  await prisma.$executeRawUnsafe(`TRUNCATE "NotaEvento","NotaFiscal","InutilizacaoNumeracao","Empresa","Sequencia" CASCADE`);
  await prisma.empresa.create({ data: {
    razaoSocial: "MXTECH TESTE LTDA", cnpj: "12345678000195", inscricaoEstadual: "111111111111", logradouro: "Rua A", numero: "1",
    bairro: "Centro", cidade: "São Carlos", codigoMunicipio: "3548906", uf: "SP", cep: "13560000",
  } });
});

const nota = (numero: number, status: "AUTORIZADA" | "REJEITADA" | "ENVIADA", modelo: "NFE" | "NFCE" = "NFE") =>
  prisma.notaFiscal.create({ data: { modelo, serie: 1, numero, status, ambiente: "HOMOLOGACAO", valorTotal: 10, chave: status === "AUTORIZADA" ? CHAVE.slice(0, 34) + String(numero).padStart(10, "0") : null, protocolo: status === "AUTORIZADA" ? "1" : null, motivo: status === "REJEITADA" ? "778 - NCM" : null } });

describe("XML da inutilização e da CC-e", () => {
  it("inutilização assinada é válida no schema e o Id tem 41 dígitos", async () => {
    let enviado = "";
    const fake: Transporte = async (_u, acao, corpo) => {
      enviado = corpo;
      expect(acao).toMatch(/nfeInutilizacaoNF$/);
      return `<E><retInutNFe versao="4.00"><infInut><tpAmb>2</tpAmb><cStat>102</cStat><xMotivo>Inutilizacao de numero homologado</xMotivo><nProt>135270000000077</nProt></infInut></retInutNFe></E>`;
    };
    const { ClienteSefaz } = await import("@/lib/fiscal/sefaz");
    const r = await new ClienteSefaz(cert, "SP", 2, fake).inutilizar({ modelo: 55, serie: 1, inicio: 3, fim: 5, justificativa: "Numeração pulada por rejeição", cnpj: "12.345.678/0001-95", ano: 2027 });
    expect(r).toMatchObject({ ok: true, cStat: "102", protocolo: "135270000000077" });
    const xml = corpoDe(enviado);
    expect(xml).toContain('Id="ID3527123456780001955500100000000300000000');
    expect(xml).toContain("<xJust>Numeracao pulada por rejeicao</xJust>"); // sem acentos
    expect(xsd(xml, "inutNFe_v4.00.xsd")).toBe("ok");
  });

  it("CC-e é válida no schema; recusa texto curto e mais de 20 correções", async () => {
    const xml = montarCartaCorrecao({ chave: CHAVE, correcao: "Endereço de entrega: Rua B, 20", sequencia: 2, cnpj: "12345678000195", tpAmb: 2 });
    expect(xml).toContain(`Id="ID110110${CHAVE}02"`);
    const { assinarXml } = await import("@/lib/fiscal/assinatura");
    const env = `<envEvento xmlns="http://www.portalfiscal.inf.br/nfe" versao="1.00"><idLote>1</idLote>${assinarXml(xml, cert, { tag: "infEvento", pai: "evento" })}</envEvento>`;
    expect(xsd(env, "envCCe_v1.00.xsd")).toBe("ok");
    expect(() => montarCartaCorrecao({ chave: CHAVE, correcao: "curto", sequencia: 1, cnpj: "1", tpAmb: 2 })).toThrow(/15/);
    expect(() => montarCartaCorrecao({ chave: CHAVE, correcao: "texto com tamanho suficiente", sequencia: 21, cnpj: "1", tpAmb: 2 })).toThrow(/20/);
    expect(() => montarInutilizacao({ modelo: 55, serie: 1, inicio: 5, fim: 3, justificativa: "faixa invertida de teste", cnpj: "1", uf: "SP", tpAmb: 2 })).toThrow(/Faixa/);
  });
});

describe("inutilização no sistema", () => {
  it("lista números rejeitados/pulados, inutiliza e marca as notas", async () => {
    await prisma.sequencia.create({ data: { chave: "NF-12345678000195-55-1-H", valor: 6 } });
    await nota(1, "AUTORIZADA"); await nota(2, "REJEITADA"); await nota(3, "REJEITADA");
    await nota(5, "ENVIADA"); await nota(6, "AUTORIZADA"); // 4 foi reservado e não virou nota
    expect((await inut.numerosPendentes({ id: (await prisma.empresa.findFirstOrThrow()).id, cnpj: "12345678000195" }, "NFE", 1, "HOMOLOGACAO")).map((f) => [f.inicio, f.fim, f.notas.length])).toEqual([[2, 4, 2]]);

    const ok: Transporte = async () => `<E><retInutNFe><infInut><cStat>102</cStat><xMotivo>Homologado</xMotivo><nProt>99</nProt></infInut></retInutNFe></E>`;
    await expect(inut.inutilizarNumeracao({ modelo: "NFE", serie: 1, inicio: 4, fim: 5, justificativa: "Numero nao utilizado" }, { cert, transporte: ok })).rejects.toThrow(/enviada/);
    await expect(inut.inutilizarNumeracao({ modelo: "NFE", serie: 1, inicio: 7, fim: 8, justificativa: "Numero nao utilizado" }, { cert, transporte: ok })).rejects.toThrow(/ainda vai usar/);
    const r = await inut.inutilizarNumeracao({ modelo: "NFE", serie: 1, inicio: 2, fim: 4, justificativa: "Numero nao utilizado" }, { cert, transporte: ok });
    expect(r).toMatchObject({ status: "HOMOLOGADA", protocolo: "99" });
    expect(await prisma.notaFiscal.count({ where: { status: "INUTILIZADA" } })).toBe(2);
    expect(await inut.numerosPendentes({ id: (await prisma.empresa.findFirstOrThrow()).id, cnpj: "12345678000195" }, "NFE", 1, "HOMOLOGACAO")).toEqual([]);
    await expect(inut.inutilizarNumeracao({ modelo: "NFE", serie: 1, inicio: 3, fim: 3, justificativa: "Numero nao utilizado" }, { cert, transporte: ok })).rejects.toThrow(/já foram inutilizados/);
  });

  it("rejeição da SEFAZ fica registrada sem mexer nas notas", async () => {
    await prisma.sequencia.create({ data: { chave: "NF-12345678000195-65-1-H", valor: 2 } });
    await nota(1, "REJEITADA", "NFCE"); await nota(2, "AUTORIZADA", "NFCE");
    const recusa: Transporte = async () => `<E><retInutNFe><infInut><cStat>241</cStat><xMotivo>Rejeicao: Um numero da faixa ja foi utilizado</xMotivo></infInut></retInutNFe></E>`;
    const r = await inut.inutilizarNumeracao({ modelo: "NFCE", serie: 1, inicio: 1, fim: 1, justificativa: "Numero nao utilizado" }, { cert, transporte: recusa });
    expect(r.status).toBe("REJEITADA");
    expect(await prisma.notaFiscal.count({ where: { status: "INUTILIZADA" } })).toBe(0);
  });
});

describe("carta de correção", () => {
  it("numera as cartas em sequência e só vale para NF-e autorizada", async () => {
    const n = await nota(7, "AUTORIZADA");
    let seqs: string[] = [];
    const ok: Transporte = async (_u, acao, corpo) => {
      expect(acao).toMatch(/nfeRecepcaoEvento$/);
      seqs.push(corpo.match(/<nSeqEvento>(\d+)</)![1]);
      return `<E><retEnvEvento><cStat>128</cStat><retEvento><infEvento><cStat>135</cStat><xMotivo>Evento registrado</xMotivo><nProt>13527000000010${seqs.length}</nProt></infEvento></retEvento></retEnvEvento></E>`;
    };
    const a = await inut.cartaCorrecao(n.id, "Endereço de entrega: Rua B, 20", { cert, transporte: ok });
    const b = await inut.cartaCorrecao(n.id, "Endereço de entrega: Rua B, 20 e transportadora XYZ", { cert, transporte: ok });
    expect([a.sequencia, b.sequencia]).toEqual([1, 2]);
    expect(seqs).toEqual(["1", "2"]);
    expect(b.texto).toContain("transportadora");
    expect((await prisma.notaFiscal.findUniqueOrThrow({ where: { id: n.id } })).status).toBe("AUTORIZADA");

    const recusa: Transporte = async () => `<E><retEnvEvento><cStat>128</cStat><retEvento><infEvento><cStat>573</cStat><xMotivo>Rejeicao: Duplicidade de evento</xMotivo></infEvento></retEvento></retEnvEvento></E>`;
    await expect(inut.cartaCorrecao(n.id, "Outra correção qualquer aqui", { cert, transporte: recusa })).rejects.toThrow(/573/);
    const nfce = await nota(8, "AUTORIZADA", "NFCE");
    await expect(inut.cartaCorrecao(nfce.id, "Correção que não existe na NFC-e", { cert, transporte: ok })).rejects.toThrow(/modelo 55/);
    seqs = [];
  });
});
