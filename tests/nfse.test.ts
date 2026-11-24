import { describe, expect, it } from "vitest";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { lerCertificado } from "@/lib/fiscal/certificado";
import { verificarAssinatura, assinarXml } from "@/lib/fiscal/assinatura";
import { ClienteNfse, assinarDps, gunzipB64, gzipB64, idDps, montarDps, montarPedidoCancelamento, type DadosDps, type TransporteRest } from "@/lib/fiscal/nfse";
import { pfxDeTeste } from "./helpers/certificado-teste";

const { pfx, senha } = pfxDeTeste();
const cert = lerCertificado(pfx, senha);

function xsd(xml: string, schema: string) {
  const f = path.join(fs.mkdtempSync(path.join(os.tmpdir(), "nfse-")), "x.xml");
  fs.writeFileSync(f, xml);
  try { execFileSync("xmllint", ["--noout", "--schema", path.resolve("fiscal-schemas/nfse", schema), f], { stdio: "pipe" }); return "ok"; }
  catch (e) { return String((e as { stderr?: Buffer }).stderr); }
}

const dados: DadosDps = {
  tpAmb: 2, emissao: new Date("2027-01-04T13:00:00Z"), competencia: new Date("2027-01-04T13:00:00Z"), serie: "1", numero: 42,
  prestador: { cnpj: "12345678000195", im: "12345", codigoMunicipio: "3548906", opSimpNac: 3, regApTribSN: 1 },
  tomador: {
    documento: "11222333000181", nome: "Condomínio Teste",
    endereco: { codigoMunicipio: "3548906", cep: "13561390", logradouro: "Av. dos Sanhaços", numero: "1179", bairro: "Parque Faber" },
  },
  servico: { codigoMunicipioPrestacao: "3548906", cTribNac: "140101", descricao: "Instalação de rede e configuração de switch", valor: 600 },
};

describe("NFS-e nacional", () => {
  it("Id da DPS tem 45 posições", () => {
    expect(idDps(dados)).toBe("DPS354890621234567800019500001000000000000042");
    expect(idDps(dados)).toHaveLength(45);
  });

  it("DPS assinada é válida no schema oficial", () => {
    const { xml } = montarDps(dados);
    const assinada = assinarDps(xml, cert);
    expect(xsd(assinada, "DPS_v1.00.xsd")).toBe("ok");
    expect(verificarAssinatura(assinada, cert.certificadoPem)).toBe(true);
  });

  it("não optante com alíquota e tomador pessoa física também valida", () => {
    const { xml } = montarDps({
      ...dados,
      prestador: { ...dados.prestador, opSimpNac: 1 },
      tomador: { documento: "52998224725", nome: "Fulano" },
      servico: { ...dados.servico, aliquotaIss: 2 },
    });
    expect(xml).toContain("<pAliq>2.00</pAliq>");
    expect(xsd(assinarDps(xml, cert), "DPS_v1.00.xsd")).toBe("ok");
  });

  it("natureza, apuração, imunidade e suspensão da empresa vão na DPS e validam no schema", () => {
    const sus = montarDps({
      ...dados,
      prestador: { ...dados.prestador, regApTribSN: 2 },
      servico: { ...dados.servico, aliquotaIss: 3, suspensao: { tpSusp: 2, nProcesso: "123456/2026" } },
    }).xml;
    expect(sus).toContain("<regApTribSN>2</regApTribSN>");
    expect(sus).toContain(`<exigSusp><tpSusp>2</tpSusp><nProcesso>${"1234562026".padStart(30, "0")}</nProcesso></exigSusp>`);
    expect(sus).toContain("<pAliq>3.00</pAliq>"); // ISS por fora do Simples: informa a alíquota
    expect(xsd(assinarDps(sus, cert), "DPS_v1.00.xsd")).toBe("ok");
    const imune = montarDps({ ...dados, servico: { ...dados.servico, tribISSQN: 2, tpImunidade: 3 } }).xml;
    expect(imune).toContain("<tribISSQN>2</tribISSQN><tpImunidade>3</tpImunidade>");
    expect(xsd(assinarDps(imune, cert), "DPS_v1.00.xsd")).toBe("ok");
    const naoInc = montarDps({ ...dados, servico: { ...dados.servico, tribISSQN: 4 } }).xml;
    expect(xsd(assinarDps(naoInc, cert), "DPS_v1.00.xsd")).toBe("ok");
  });

  it("pedido de cancelamento é válido no schema", () => {
    const chave = "3548906212345678000195000000000004227011234567890".padEnd(50, "0");
    const xml = montarPedidoCancelamento({ tpAmb: 2, cnpj: "12345678000195", chave, cMotivo: 1, motivo: "Erro no valor do serviço informado" });
    expect(xsd(assinarXml(xml, cert, { tag: "infPedReg", pai: "pedRegEvento" }), "pedRegEvento_v1.00.xsd")).toBe("ok");
  });

  it("envia DPS compactada e lê a chave da NFS-e", async () => {
    let enviado: { dpsXmlGZipB64: string } | null = null;
    const fake: TransporteRest = async (metodo, url, corpo) => {
      expect(metodo).toBe("POST");
      expect(url).toBe("https://sefin.producaorestrita.nfse.gov.br/SefinNacional/nfse");
      enviado = JSON.parse(corpo!);
      return { status: 201, corpo: JSON.stringify({ chaveAcesso: "3".repeat(50), nfseXmlGZipB64: gzipB64("<NFSe/>") }) };
    };
    const r = await new ClienteNfse(cert, 2, fake).emitir(assinarDps(montarDps(dados).xml, cert));
    expect(r).toMatchObject({ ok: true, chave: "3".repeat(50), xmlNfse: "<NFSe/>" });
    expect(gunzipB64(enviado!.dpsXmlGZipB64)).toContain("<infDPS");
  });

  it("traduz erros da API", async () => {
    const fake: TransporteRest = async () => ({ status: 400, corpo: JSON.stringify({ erros: [{ Codigo: "E0001", Descricao: "Município não conveniado" }] }) });
    const r = await new ClienteNfse(cert, 2, fake).emitir("<DPS/>");
    expect(r).toMatchObject({ ok: false, mensagem: "E0001 Município não conveniado" });
  });
});
