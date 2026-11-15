import { describe, expect, it } from "vitest";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { dvMod11, gerarChave } from "@/lib/fiscal/chave";
import { lerCertificado } from "@/lib/fiscal/certificado";
import { assinarXml, verificarAssinatura } from "@/lib/fiscal/assinatura";
import { incluirInfNFeSupl, montarNfe, qrCodeNfce, type DadosNota } from "@/lib/fiscal/nfe";
import { pfxDeTeste } from "./helpers/certificado-teste";

const { pfx, senha } = pfxDeTeste();
const cert = lerCertificado(pfx, senha);
const XSD = path.resolve("fiscal-schemas/nfe/nfe_v4.00.xsd");

function validarXsd(xml: string) {
  const f = path.join(fs.mkdtempSync(path.join(os.tmpdir(), "nfe-")), "nota.xml");
  fs.writeFileSync(f, xml);
  try {
    execFileSync("xmllint", ["--noout", "--schema", XSD, f], { stdio: "pipe" });
    return "ok";
  } catch (e) {
    return String((e as { stderr?: Buffer }).stderr ?? e);
  }
}

const base: DadosNota = {
  modelo: 55, serie: 1, numero: 123, cNF: 12345678, emissao: new Date("2027-01-04T13:00:00Z"), tpAmb: 2,
  naturezaOperacao: "Venda de mercadoria", consumidorFinal: true, presenca: 1,
  emitente: {
    cnpj: "12345678000195", razaoSocial: "MXTECH TESTE LTDA", ie: "111111111111", crt: 1,
    endereco: { logradouro: "Rua Teste", numero: "100", bairro: "Centro", codigoMunicipio: "3548906", municipio: "São Carlos", uf: "SP", cep: "13560-000" },
  },
  destinatario: {
    documento: "11222333000181", nome: "Condomínio Teste", indIEDest: 9,
    endereco: { logradouro: "Av. dos Sanhaços", numero: "1179", bairro: "Parque Faber", codigoMunicipio: "3548906", municipio: "São Carlos", uf: "SP", cep: "13561390" },
  },
  itens: [
    { codigo: "F0821GBL", descricao: "Switch 8 portas PoE", ncm: "85176259", cfop: "5102", unidade: "UN", quantidade: 2, valorUnit: 499, origem: 0, csosn: "102" },
    { codigo: "107133", gtin: "7891234567895", descricao: "Cabo drop 1FO", ncm: "85447010", cfop: "5102", unidade: "M", quantidade: 100, valorUnit: 2.29, desconto: 9, origem: 0, csosn: "102" },
  ],
  pagamentos: [{ tPag: "15", valor: 1218 }],
};

describe("chave de acesso", () => {
  it("calcula o dígito verificador", () => {
    // exemplo do Manual de Orientação do Contribuinte
    expect(dvMod11("5206043300991100250655012000000780026730161")).toBe(5);
  });
  it("tem 44 dígitos", () => {
    const { chave } = gerarChave({ cUF: 35, emissao: new Date("2027-01-04"), cnpj: "12345678000195", modelo: 55, serie: 1, numero: 123, cNF: 12345678 });
    expect(chave).toMatch(/^3527011234567800019555001000000123112345678\d$/);
  });
});

describe("NF-e modelo 55", () => {
  it("gera XML válido no schema oficial e com assinatura verificável", () => {
    const { xml, chave, totais } = montarNfe(base);
    expect(totais.vNF).toBe(1218);
    const assinado = assinarXml(xml, cert, { tag: "infNFe", pai: "NFe" });
    expect(validarXsd(assinado)).toBe("ok");
    expect(verificarAssinatura(assinado, cert.certificadoPem)).toBe(true);
    expect(assinado).toContain(`Id="NFe${chave}"`);
    expect(assinado).toContain("SEM VALOR FISCAL"); // destinatário em homologação
  });

  it("recusa pagamento que não fecha", () => {
    expect(() => montarNfe({ ...base, pagamentos: [{ tPag: "01", valor: 10 }] })).toThrow(/não fecham/);
  });

  it("regime normal com ICMS 00 também valida", () => {
    const { xml } = montarNfe({
      ...base,
      emitente: { ...base.emitente, crt: 3 },
      itens: base.itens.map((i) => ({ ...i, csosn: null, cstIcms: "00", aliquotaIcms: 18 })),
    });
    expect(validarXsd(assinarXml(xml, cert, { tag: "infNFe", pai: "NFe" }))).toBe("ok");
  });
});

describe("NFC-e modelo 65", () => {
  it("gera XML com QR Code válido no schema", () => {
    const { xml, chave } = montarNfe({
      ...base, modelo: 65, destinatario: null,
      pagamentos: [{ tPag: "01", valor: 1300 }, { tPag: "17", valor: 0.01 }], troco: 82.01,
    });
    const qr = qrCodeNfce(chave, 2, "000001", "CSC-DE-TESTE");
    expect(qr).toMatch(new RegExp(`\\?p=${chave}\\|2\\|2\\|1\\|[0-9A-F]{40}$`));
    const assinado = assinarXml(incluirInfNFeSupl(xml, qr, 2), cert, { tag: "infNFe", pai: "NFe" });
    expect(validarXsd(assinado)).toBe("ok");
    expect(assinado).toContain("EMITIDA EM AMBIENTE DE HOMOLOGACAO");
    expect(verificarAssinatura(assinado, cert.certificadoPem)).toBe(true);
  });
});
