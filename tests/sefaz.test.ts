import { describe, expect, it } from "vitest";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { lerCertificado } from "@/lib/fiscal/certificado";
import { assinarXml } from "@/lib/fiscal/assinatura";
import { montarNfe, type DadosNota } from "@/lib/fiscal/nfe";
import { ClienteSefaz, montarProc, type Transporte } from "@/lib/fiscal/sefaz";
import { pfxDeTeste } from "./helpers/certificado-teste";

const { pfx, senha } = pfxDeTeste();
const cert = lerCertificado(pfx, senha);

function xsd(xml: string, schema: string) {
  const f = path.join(fs.mkdtempSync(path.join(os.tmpdir(), "sefaz-")), "x.xml");
  fs.writeFileSync(f, xml);
  try {
    execFileSync("xmllint", ["--noout", "--schema", path.resolve("fiscal-schemas/nfe", schema), f], { stdio: "pipe" });
    return "ok";
  } catch (e) {
    return String((e as { stderr?: Buffer }).stderr ?? e);
  }
}

/** extrai o conteúdo de nfeDadosMsg do envelope */
const corpoDe = (soap: string) => soap.match(/<nfeDadosMsg[^>]*>([\s\S]*)<\/nfeDadosMsg>/)![1];

const dados: DadosNota = {
  modelo: 55, serie: 1, numero: 7, cNF: 87654321, emissao: new Date("2027-01-04T13:00:00Z"), tpAmb: 2,
  naturezaOperacao: "Venda", consumidorFinal: true, presenca: 1,
  emitente: { cnpj: "12345678000195", razaoSocial: "MXTECH", ie: "111111111111", crt: 1,
    endereco: { logradouro: "Rua A", numero: "1", bairro: "Centro", codigoMunicipio: "3548906", municipio: "Sao Carlos", uf: "SP", cep: "13560000" } },
  itens: [{ codigo: "X", descricao: "Produto", ncm: "85176259", cfop: "5102", unidade: "UN", quantidade: 1, valorUnit: 100, origem: 0 }],
  pagamentos: [{ tPag: "01", valor: 100 }],
};

describe("cliente SEFAZ", () => {
  it("envia lote válido no schema e lê protocolo de autorização", async () => {
    const { xml, chave } = montarNfe(dados);
    const assinada = assinarXml(xml, cert, { tag: "infNFe", pai: "NFe" });
    let enviado = "";
    let acao = "";
    const fake: Transporte = async (url, soapAction, corpo) => {
      enviado = corpo; acao = soapAction;
      expect(url).toContain("homologacao.nfe.fazenda.sp.gov.br");
      return `<?xml version="1.0"?><soap:Envelope xmlns:soap="http://www.w3.org/2003/05/soap-envelope"><soap:Body><nfeResultMsg xmlns="http://www.portalfiscal.inf.br/nfe/wsdl/NFeAutorizacao4"><retEnviNFe versao="4.00" xmlns="http://www.portalfiscal.inf.br/nfe"><tpAmb>2</tpAmb><verAplic>SP_NFE_PL009_V4</verAplic><cStat>104</cStat><xMotivo>Lote processado</xMotivo><cUF>35</cUF><dhRecbto>2027-01-04T10:00:01-03:00</dhRecbto><protNFe versao="4.00"><infProt><tpAmb>2</tpAmb><verAplic>SP_NFE_PL009_V4</verAplic><chNFe>${chave}</chNFe><dhRecbto>2027-01-04T10:00:01-03:00</dhRecbto><nProt>135270000000001</nProt><digVal>abc=</digVal><cStat>100</cStat><xMotivo>Autorizado o uso da NF-e</xMotivo></infProt></protNFe></retEnviNFe></nfeResultMsg></soap:Body></soap:Envelope>`;
    };
    const cli = new ClienteSefaz(cert, "SP", 2, fake);
    const r = await cli.autorizar(assinada, 55, 1);
    expect(acao).toBe("http://www.portalfiscal.inf.br/nfe/wsdl/NFeAutorizacao4/nfeAutorizacaoLote");
    expect(xsd(corpoDe(enviado), "enviNFe_v4.00.xsd")).toBe("ok");
    expect(r).toMatchObject({ autorizada: true, cStat: "100", protocolo: "135270000000001" });
    const proc = montarProc(assinada, r.protXml!);
    expect(xsd(proc, "procNFe_v4.00.xsd")).toBe("ok");
  });

  it("devolve a rejeição com o motivo", async () => {
    const fake: Transporte = async () => `<Envelope><Body><retEnviNFe><cStat>104</cStat><xMotivo>Lote processado</xMotivo><protNFe><infProt><cStat>539</cStat><xMotivo>Rejeicao: Duplicidade de NF-e</xMotivo></infProt></protNFe></retEnviNFe></Body></Envelope>`;
    const r = await new ClienteSefaz(cert, "SP", 2, fake).autorizar("<NFe/>", 55, 1);
    expect(r).toMatchObject({ autorizada: false, cStat: "539" });
  });

  it("evento de cancelamento é válido no schema", async () => {
    let enviado = "";
    const fake: Transporte = async (_u, _a, corpo) => {
      enviado = corpo;
      return `<Envelope><Body><retEnvEvento><cStat>128</cStat><retEvento><infEvento><cStat>135</cStat><xMotivo>Evento registrado</xMotivo><nProt>135270000000002</nProt></infEvento></retEvento></retEnvEvento></Body></Envelope>`;
    };
    const chave = montarNfe(dados).chave;
    const r = await new ClienteSefaz(cert, "SP", 2, fake).cancelar({
      modelo: 55, chave, protocolo: "135270000000001", justificativa: "Venda cancelada pelo cliente", cnpj: "12345678000195", idLote: 2,
    });
    expect(r.ok).toBe(true);
    expect(xsd(corpoDe(enviado), "envEventoCancNFe_v1.00.xsd")).toBe("ok");
  });

  it("consulta de status é válida no schema", async () => {
    let enviado = "";
    const fake: Transporte = async (_u, _a, corpo) => { enviado = corpo; return `<a><retConsStatServ><cStat>107</cStat><xMotivo>Servico em Operacao</xMotivo></retConsStatServ></a>`; };
    expect(await new ClienteSefaz(cert, "SP", 2, fake).status()).toMatchObject({ cStat: "107" });
    expect(xsd(corpoDe(enviado), "consStatServ_v4.00.xsd")).toBe("ok");
  });
});
