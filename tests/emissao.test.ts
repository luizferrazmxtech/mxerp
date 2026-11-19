import { beforeAll, beforeEach, describe, expect, it } from "vitest";
import { execFileSync, execSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { pfxDeTeste } from "./helpers/certificado-teste";

const URL = "postgresql://mxerp:mxerp@localhost:5432/mxerp_test?schema=public";
process.env.DATABASE_URL = URL;

const { prisma } = await import("@/lib/db");
const est = await import("@/lib/estoque/estoque");
const vendas = await import("@/lib/vendas/vendas");
const { garantirPadroes } = await import("@/lib/financeiro/padroes");
const { lerCertificado } = await import("@/lib/fiscal/certificado");
const fiscal = await import("@/lib/fiscal/emissao");
const osSvc = await import("@/lib/os/os");
const { gzipB64 } = await import("@/lib/fiscal/nfse");
type Transporte = import("@/lib/fiscal/sefaz").Transporte;

const { pfx, senha } = pfxDeTeste();
const cert = lerCertificado(pfx, senha);

const autoriza: Transporte = async (_u, acao, corpo) => {
  if (acao.endsWith("nfeRecepcaoEvento"))
    return `<E><retEvento><infEvento><cStat>135</cStat><xMotivo>Evento registrado</xMotivo><nProt>2</nProt></infEvento></retEvento></E>`;
  const chave = corpo.match(/Id="NFe(\d{44})"/)![1];
  return `<E><B><retEnviNFe xmlns="http://www.portalfiscal.inf.br/nfe" versao="4.00"><cStat>104</cStat><xMotivo>Lote processado</xMotivo><protNFe versao="4.00"><infProt><tpAmb>2</tpAmb><verAplic>T</verAplic><chNFe>${chave}</chNFe><dhRecbto>2027-01-04T10:00:01-03:00</dhRecbto><nProt>135270000000001</nProt><digVal>abc=</digVal><cStat>100</cStat><xMotivo>Autorizado o uso da NF-e</xMotivo></infProt></protNFe></retEnviNFe></B></E>`;
};

function xsdProc(xml: string) {
  const f = path.join(fs.mkdtempSync(path.join(os.tmpdir(), "proc-")), "p.xml");
  fs.writeFileSync(f, xml);
  try { execFileSync("xmllint", ["--noout", "--schema", path.resolve("fiscal-schemas/nfe/procNFe_v4.00.xsd"), f], { stdio: "pipe" }); return "ok"; }
  catch (e) { return String((e as { stderr?: Buffer }).stderr); }
}

let prod: string, dinheiro: string;

beforeAll(() => execSync("npx prisma migrate deploy", { env: { ...process.env, DATABASE_URL: URL }, stdio: "ignore" }));

beforeEach(async () => {
  await prisma.$executeRawUnsafe(`TRUNCATE "NotaEvento","NotaFiscal","Empresa","OsItemServico","OsItemProduto","OsHistorico","OrdemServico","Servico","Lancamento","VendaPagamento","VendaItem","Venda","Reserva","MovimentoEstoque","Saldo","Produto","Local","Deposito","Pessoa","Sequencia","FormaPagamento","CategoriaFinanceira","ContaBancaria" CASCADE`);
  await prisma.empresa.create({ data: {
    razaoSocial: "MXTECH TESTE LTDA", cnpj: "12345678000195", inscricaoEstadual: "111111111111", logradouro: "Rua A", numero: "1",
    bairro: "Centro", cidade: "São Carlos", codigoMunicipio: "3548906", uf: "SP", cep: "13560000", cscId: "000001", cscToken: "CSCTESTE",
  } });
  const dep = await prisma.deposito.create({ data: { nome: "Loja" } });
  const loc = (await prisma.local.create({ data: { depositoId: dep.id, codigo: "A-01" } })).id;
  prod = (await prisma.produto.create({ data: { codigo: "CB", nome: "Cabo USB-C", precoVenda: 39, ncm: "85444200", localPadraoId: loc } })).id;
  await prisma.$transaction(async (tx) => { await est.entrada(tx, { produtoId: prod, localId: loc, quantidade: 10, origemTipo: "IMPLANTACAO" }); await garantirPadroes(tx); });
  dinheiro = (await prisma.formaPagamento.findUniqueOrThrow({ where: { nome: "Dinheiro" } })).id;
});

describe("emissão a partir da venda", () => {
  it("NFC-e autorizada guarda o XML de distribuição e numera em sequência", async () => {
    const v = await vendas.vendaBalcao({ itens: [{ produtoId: prod, quantidade: 3 }], desconto: 7, pagamentos: [{ formaPagamentoId: dinheiro, valor: 110 }] });
    const n = await fiscal.emitirNotaVenda(v.id, 65, { cert, transporte: autoriza });
    expect(n).toMatchObject({ status: "AUTORIZADA", numero: 1, protocolo: "135270000000001" });
    expect(Number(n.valorTotal)).toBe(110);
    expect(xsdProc(n.xml!)).toBe("ok");
    expect(n.xml).toContain("<qrCode>");
    await expect(fiscal.emitirNotaVenda(v.id, 65, { cert, transporte: autoriza })).rejects.toThrow(/Já existe nota autorizada/);
    const v2 = await vendas.vendaBalcao({ itens: [{ produtoId: prod, quantidade: 1 }], pagamentos: [{ formaPagamentoId: dinheiro, valor: 39 }] });
    expect((await fiscal.emitirNotaVenda(v2.id, 65, { cert, transporte: autoriza })).numero).toBe(2);
  });

  it("rejeição fica registrada com o motivo", async () => {
    const v = await vendas.vendaBalcao({ itens: [{ produtoId: prod, quantidade: 1 }], pagamentos: [{ formaPagamentoId: dinheiro, valor: 39 }] });
    const rejeita: Transporte = async () => `<E><retEnviNFe><cStat>104</cStat><protNFe><infProt><cStat>778</cStat><xMotivo>Rejeicao: NCM inexistente</xMotivo></infProt></protNFe></retEnviNFe></E>`;
    const n = await fiscal.emitirNotaVenda(v.id, 65, { cert, transporte: rejeita });
    expect(n).toMatchObject({ status: "REJEITADA", motivo: "778 - Rejeicao: NCM inexistente" });
  });

  it("SEFAZ sem resposta deixa a nota como enviada, bloqueia outra emissão e a consulta resolve", async () => {
    const v = await vendas.vendaBalcao({ itens: [{ produtoId: prod, quantidade: 1 }], pagamentos: [{ formaPagamentoId: dinheiro, valor: 39 }] });
    const caiu: Transporte = async () => { throw new Error("Tempo esgotado na comunicação com a SEFAZ"); };
    await expect(fiscal.emitirNotaVenda(v.id, 65, { cert, transporte: caiu })).rejects.toThrow(/Tempo esgotado/);
    const n = await prisma.notaFiscal.findFirstOrThrow({ where: { origemId: v.id } });
    expect(n.status).toBe("ENVIADA");
    // emitir de novo com outro número duplicaria a venda se a primeira tiver sido autorizada
    await expect(fiscal.emitirNotaVenda(v.id, 65, { cert, transporte: autoriza })).rejects.toThrow(/Consultar na SEFAZ/);
    const consulta: Transporte = async (_u, acao, corpo) => {
      expect(acao).toMatch(/nfeConsultaNF$/);
      const chave = corpo.match(/<chNFe>(\d{44})<\/chNFe>/)![1];
      return `<E><retConsSitNFe xmlns="http://www.portalfiscal.inf.br/nfe" versao="4.00"><cStat>100</cStat><xMotivo>Autorizado</xMotivo><protNFe versao="4.00"><infProt><tpAmb>2</tpAmb><verAplic>T</verAplic><chNFe>${chave}</chNFe><dhRecbto>2027-01-04T10:00:01-03:00</dhRecbto><nProt>135270000000009</nProt><digVal>abc=</digVal><cStat>100</cStat><xMotivo>Autorizado o uso da NF-e</xMotivo></infProt></protNFe></retConsSitNFe></E>`;
    };
    const c = await fiscal.consultarNota(n.id, { cert, transporte: consulta });
    expect(c).toMatchObject({ status: "AUTORIZADA", protocolo: "135270000000009" });
    expect(xsdProc(c.xml!)).toBe("ok");
    // lote em processamento (103) também espera a consulta; "não consta" (217) libera nova emissão
    const v2 = await vendas.vendaBalcao({ itens: [{ produtoId: prod, quantidade: 1 }], pagamentos: [{ formaPagamentoId: dinheiro, valor: 39 }] });
    const lote: Transporte = async () => `<E><retEnviNFe><cStat>103</cStat><xMotivo>Lote recebido com sucesso</xMotivo><infRec><nRec>1</nRec></infRec></retEnviNFe></E>`;
    expect((await fiscal.emitirNotaVenda(v2.id, 65, { cert, transporte: lote })).status).toBe("ENVIADA");
    const n2 = await prisma.notaFiscal.findFirstOrThrow({ where: { origemId: v2.id } });
    const naoConsta: Transporte = async () => `<E><retConsSitNFe><cStat>217</cStat><xMotivo>Rejeicao: NF-e nao consta na base de dados da SEFAZ</xMotivo></retConsSitNFe></E>`;
    expect((await fiscal.consultarNota(n2.id, { cert, transporte: naoConsta })).status).toBe("REJEITADA");
    expect((await fiscal.emitirNotaVenda(v2.id, 65, { cert, transporte: autoriza })).status).toBe("AUTORIZADA");
  });

  it("desconto geral de documento com peças e serviços é dividido entre NF-e e NFS-e", () => {
    expect(fiscal.dividirDesconto(100, 100, 20)).toEqual({ produtos: 10, servicos: 10 });
    // peça barata e serviço caro: a NF-e não fica negativa
    expect(fiscal.dividirDesconto(10, 100, 20)).toEqual({ produtos: 1.82, servicos: 18.18 });
    expect(fiscal.dividirDesconto(50, 0, 5)).toEqual({ produtos: 5, servicos: 0 });
  });

  it("NF-e exige cliente com documento e produto com NCM", async () => {
    const v = await vendas.vendaBalcao({ itens: [{ produtoId: prod, quantidade: 1 }], pagamentos: [{ formaPagamentoId: dinheiro, valor: 39 }] });
    await expect(fiscal.emitirNotaVenda(v.id, 55, { cert, transporte: autoriza })).rejects.toThrow(/CPF\/CNPJ/);
    await prisma.produto.update({ where: { id: prod }, data: { ncm: null } });
    const v2 = await vendas.vendaBalcao({ itens: [{ produtoId: prod, quantidade: 1 }], pagamentos: [{ formaPagamentoId: dinheiro, valor: 39 }] });
    await expect(fiscal.emitirNotaVenda(v2.id, 65, { cert, transporte: autoriza })).rejects.toThrow(/NCM/);
  });

  it("cancela nota autorizada", async () => {
    const v = await vendas.vendaBalcao({ itens: [{ produtoId: prod, quantidade: 1 }], pagamentos: [{ formaPagamentoId: dinheiro, valor: 39 }] });
    const n = await fiscal.emitirNotaVenda(v.id, 65, { cert, transporte: autoriza });
    const c = await fiscal.cancelarNota(n.id, "Cliente desistiu da compra", { cert, transporte: autoriza });
    expect(c.status).toBe("CANCELADA");
    expect(await prisma.notaEvento.count({ where: { notaId: n.id } })).toBe(1);
  });
});

describe("NFS-e da OS", () => {
  it("emite com os serviços da OS e cancela", async () => {
    await prisma.empresa.updateMany({ data: { inscricaoMunicipal: "12345" } });
    const cli = await prisma.pessoa.create({ data: { nome: "Condomínio", documento: "11222333000181" } });
    const sv = await prisma.servico.create({ data: { codigo: "INST", nome: "Instalação de rede", preco: 600, codigoTributacaoNacional: "140101" } });
    const o = await osSvc.criarOs({ clienteId: cli.id, equipamentos: [{ equipamento: "Rack" }] });
    await osSvc.adicionarServico(o.id, { servicoId: sv.id });
    await expect(fiscal.emitirNfseOs(o.id, { cert })).rejects.toThrow(/Conclua/);
    await osSvc.alterarSituacao(o.id, "CONCLUIDA");
    let enviado = "";
    const n = await fiscal.emitirNfseOs(o.id, {
      cert,
      transporte: async (_m, _u, corpo) => {
        enviado = corpo!;
        return { status: 201, corpo: JSON.stringify({ chaveAcesso: "35489062".padEnd(50, "1"), nfseXmlGZipB64: gzipB64("<NFSe>ok</NFSe>") }) };
      },
    });
    expect(n).toMatchObject({ status: "AUTORIZADA", modelo: "NFSE", numero: 1, xml: "<NFSe>ok</NFSe>" });
    expect(Number(n.valorTotal)).toBe(600);
    expect(enviado).toContain("dpsXmlGZipB64");
    const c = await fiscal.cancelarNfse(n.id, 1, "Erro no valor do serviço informado", {
      cert, transporte: async () => ({ status: 201, corpo: JSON.stringify({ eventoXmlGZipB64: gzipB64("<evento/>") }) }),
    });
    expect(c.status).toBe("CANCELADA");
  });

  it("exige código de tributação nacional no serviço", async () => {
    await prisma.empresa.updateMany({ data: { inscricaoMunicipal: "12345" } });
    const cli = await prisma.pessoa.create({ data: { nome: "X" } });
    const sv = await prisma.servico.create({ data: { codigo: "V", nome: "Visita", preco: 100 } });
    const o = await osSvc.criarOs({ clienteId: cli.id });
    await osSvc.adicionarServico(o.id, { servicoId: sv.id });
    await osSvc.alterarSituacao(o.id, "CONCLUIDA");
    await expect(fiscal.emitirNfseOs(o.id, { cert })).rejects.toThrow(/código de tributação nacional/);
  });
});
