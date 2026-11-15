import type { Empresa, ModeloNota, OrigemDocumento, Pessoa, RegimeTributario } from "@prisma/client";
import { prisma } from "@/lib/db";
import { proximoNumero } from "@/lib/sequencia";
import { assinarXml } from "./assinatura";
import { certificadoDoAmbiente, type Certificado } from "./certificado";
import { codigoNumerico } from "./chave";
import { incluirInfNFeSupl, montarNfe, qrCodeNfce, type DadosNota, type Destinatario, type ItemNota, type PagamentoNota } from "./nfe";
import { ClienteSefaz, montarProc, type Transporte } from "./sefaz";
import { ClienteNfse, assinarDps, montarDps, type TransporteRest } from "./nfse";

export class FiscalError extends Error {}

const CRT: Record<RegimeTributario, 1 | 2 | 3 | 4> = {
  SIMPLES_NACIONAL: 1,
  SIMPLES_EXCESSO_SUBLIMITE: 2,
  REGIME_NORMAL: 3,
  MEI: 4,
};

export async function empresa(): Promise<Empresa> {
  const e = await prisma.empresa.findFirst();
  if (!e) throw new FiscalError("Cadastre os dados da empresa em Notas fiscais › Configuração");
  const faltando = [
    ["IE", e.inscricaoEstadual], ["logradouro", e.logradouro], ["bairro", e.bairro], ["cidade", e.cidade],
    ["código IBGE do município", e.codigoMunicipio], ["UF", e.uf], ["CEP", e.cep],
  ].filter(([, v]) => !v).map(([n]) => n);
  if (faltando.length) throw new FiscalError(`Complete os dados da empresa: ${faltando.join(", ")}`);
  return e;
}

function emitenteDe(e: Empresa): DadosNota["emitente"] {
  return {
    cnpj: e.cnpj, razaoSocial: e.razaoSocial, nomeFantasia: e.nomeFantasia, ie: e.inscricaoEstadual!, im: e.inscricaoMunicipal,
    cnae: e.cnae, crt: CRT[e.regimeTributario],
    endereco: {
      logradouro: e.logradouro!, numero: e.numero ?? "SN", bairro: e.bairro!, codigoMunicipio: e.codigoMunicipio!,
      municipio: e.cidade!, uf: e.uf!, cep: e.cep!, telefone: e.telefone,
    },
  };
}

function destinatarioDe(p: Pessoa | null, obrigatorio: boolean): Destinatario | null {
  if (!p || !p.documento) {
    if (obrigatorio) throw new FiscalError("NF-e exige cliente com CPF/CNPJ");
    return null;
  }
  const completo = p.logradouro && p.bairro && p.codigoMunicipio && p.cidade && p.uf && p.cep;
  if (obrigatorio && !completo) throw new FiscalError(`Complete o endereço do cliente ${p.nome} (com código IBGE do município)`);
  return {
    documento: p.documento,
    nome: p.nome,
    ie: p.inscricaoEstadual,
    indIEDest: p.contribuinteIcms === "CONTRIBUINTE" ? 1 : p.contribuinteIcms === "ISENTO" ? 2 : 9,
    email: p.email,
    endereco: completo
      ? { logradouro: p.logradouro!, numero: p.numero ?? "SN", complemento: p.complemento, bairro: p.bairro!, codigoMunicipio: p.codigoMunicipio!, municipio: p.cidade!, uf: p.uf!, cep: p.cep!, telefone: p.telefone }
      : null,
  };
}

type ItemOrigem = {
  quantidade: unknown; valorUnit: unknown; desconto: unknown;
  produto: { codigo: string; gtin: string | null; nome: string; ncm: string | null; cest: string | null; unidade: string; origem: number; cfopInterno: string | null; cfopExterno: string | null; csosn: string | null; cstIcms: string | null; aliquotaIcms: unknown; cstPis: string | null; cstCofins: string | null };
};

function itensDe(itens: ItemOrigem[], interestadual: boolean): ItemNota[] {
  const semNcm = itens.filter((i) => !i.produto.ncm || i.produto.ncm.replace(/\D/g, "").length !== 8);
  if (semNcm.length) throw new FiscalError(`Produtos sem NCM válido: ${semNcm.map((i) => i.produto.codigo).join(", ")}`);
  return itens.map((i) => ({
    codigo: i.produto.codigo, gtin: i.produto.gtin, descricao: i.produto.nome, ncm: i.produto.ncm!, cest: i.produto.cest,
    cfop: (interestadual ? i.produto.cfopExterno ?? "6102" : i.produto.cfopInterno ?? "5102"),
    unidade: i.produto.unidade, quantidade: Number(i.quantidade), valorUnit: Number(i.valorUnit), desconto: Number(i.desconto ?? 0),
    origem: i.produto.origem, csosn: i.produto.csosn, cstIcms: i.produto.cstIcms,
    aliquotaIcms: i.produto.aliquotaIcms == null ? null : Number(i.produto.aliquotaIcms),
    cstPis: i.produto.cstPis, cstCofins: i.produto.cstCofins,
  }));
}

export type Dependencias = { cert?: Certificado; transporte?: Transporte; agora?: Date };

/** Numeração: um contador por modelo, série e ambiente. */
const chaveSeq = (modelo: 55 | 65, serie: number, amb: 1 | 2) => `NF-${modelo}-${serie}-${amb === 1 ? "P" : "H"}`;

async function emitir(args: {
  modelo: 55 | 65;
  origemTipo: OrigemDocumento;
  origemId: string;
  cliente: Pessoa | null;
  itens: ItemOrigem[];
  pagamentos: PagamentoNota[];
  desconto?: number;
  infCpl?: string;
  deps: Dependencias;
}) {
  const e = await empresa();
  const amb: 1 | 2 = e.ambienteFiscal === "PRODUCAO" ? 1 : 2;
  const nfce = args.modelo === 65;
  if (nfce && (!e.cscId || !e.cscToken)) throw new FiscalError("Configure o CSC da NFC-e (ID e código) em Notas fiscais › Configuração");
  const jaAutorizada = await prisma.notaFiscal.findFirst({
    where: { origemTipo: args.origemTipo, origemId: args.origemId, status: "AUTORIZADA", modelo: nfce ? "NFCE" : "NFE" },
  });
  if (jaAutorizada) throw new FiscalError(`Já existe nota autorizada para este documento (nº ${jaAutorizada.numero})`);

  const cert = args.deps.cert ?? certificadoDoAmbiente();
  const dest = destinatarioDe(args.cliente, !nfce);
  const interestadual = !!dest?.endereco && dest.endereco.uf !== e.uf;
  const itens = itensDe(args.itens, interestadual);
  // desconto geral do documento rateado proporcionalmente; centavos que sobram vão no maior item
  if (args.desconto && args.desconto > 0) {
    const liquido = (i: ItemNota) => i.quantidade * i.valorUnit - (i.desconto ?? 0);
    const base = itens.reduce((s, i) => s + liquido(i), 0);
    let distribuido = 0;
    for (const i of itens) {
      const parte = Math.floor(((liquido(i) / base) * args.desconto) * 100) / 100;
      i.desconto = Math.round(((i.desconto ?? 0) + parte) * 100) / 100;
      distribuido += parte;
    }
    const maior = itens.reduce((a, b) => (liquido(b) > liquido(a) ? b : a));
    maior.desconto = Math.round(((maior.desconto ?? 0) + args.desconto - distribuido) * 100) / 100;
  }

  const serie = nfce ? e.serieNfce : e.serieNfe;
  const modeloEnum: ModeloNota = nfce ? "NFCE" : "NFE";
  const agora = args.deps.agora ?? new Date();

  // reserva o número numa transação própria (número consumido mesmo se rejeitar → inutilizar depois)
  const nota = await prisma.$transaction(async (tx) => {
    const numero = await proximoNumero(tx, chaveSeq(args.modelo, serie, amb));
    return tx.notaFiscal.create({
      data: { modelo: modeloEnum, serie, numero, ambiente: amb === 1 ? "PRODUCAO" : "HOMOLOGACAO", origemTipo: args.origemTipo, origemId: args.origemId, valorTotal: 0 },
    });
  });

  try {
    const montada = montarNfe({
      modelo: args.modelo, serie, numero: nota.numero, cNF: codigoNumerico(nota.numero), emissao: agora, tpAmb: amb,
      naturezaOperacao: "Venda de mercadoria", consumidorFinal: !dest || dest.indIEDest === 9, presenca: 1,
      emitente: emitenteDe(e), destinatario: dest, itens, pagamentos: args.pagamentos, infCpl: args.infCpl,
    });
    let xml = montada.xml;
    if (nfce) xml = incluirInfNFeSupl(xml, qrCodeNfce(montada.chave, amb, e.cscId!, e.cscToken!), amb);
    const assinada = assinarXml(xml, cert, { tag: "infNFe", pai: "NFe" });
    await prisma.notaFiscal.update({ where: { id: nota.id }, data: { chave: montada.chave, status: "ASSINADA", xml: assinada, valorTotal: montada.totais.vNF } });

    const cli = new ClienteSefaz(cert, e.uf!, amb, args.deps.transporte);
    const r = await cli.autorizar(assinada, args.modelo, nota.numero);
    const motivo = `${r.cStat} - ${r.xMotivo}`;
    if (r.autorizada && r.protXml) {
      return prisma.notaFiscal.update({
        where: { id: nota.id },
        data: { status: "AUTORIZADA", xml: montarProc(assinada, r.protXml), protocolo: r.protocolo, motivo, emitidaEm: agora },
      });
    }
    // 110/301/302: uso denegado
    const denegada = ["110", "301", "302", "303"].includes(r.cStat);
    return prisma.notaFiscal.update({ where: { id: nota.id }, data: { status: denegada ? "DENEGADA" : "REJEITADA", motivo } });
  } catch (err) {
    await prisma.notaFiscal.update({ where: { id: nota.id }, data: { status: "REJEITADA", motivo: (err as Error).message.slice(0, 500) } });
    throw err;
  }
}

/** NFC-e (modelo 65) ou NF-e (55) de uma venda concluída. */
export async function emitirNotaVenda(vendaId: string, modelo: 55 | 65, deps: Dependencias = {}) {
  const v = await prisma.venda.findUniqueOrThrow({
    where: { id: vendaId },
    include: { cliente: true, itens: { include: { produto: true } }, pagamentos: { include: { formaPagamento: true } } },
  });
  if (v.situacao !== "CONCLUIDA") throw new FiscalError("Conclua a venda antes de emitir a nota");
  if (!v.itens.length) throw new FiscalError("Venda sem produtos");
  const pagamentos = v.pagamentos.map((p) => ({ tPag: p.formaPagamento.tPag, valor: Number(p.valor), descricao: p.formaPagamento.nome }));
  return emitir({
    modelo, origemTipo: "VENDA", origemId: v.id, cliente: v.cliente, itens: v.itens, pagamentos,
    desconto: Number(v.desconto), infCpl: `Venda ${v.numero}`, deps,
  });
}

/** NF-e das peças de uma OS faturada/concluída (os serviços vão na NFS-e). */
export async function emitirNotaOs(osId: string, deps: Dependencias = {}) {
  const os = await prisma.ordemServico.findUniqueOrThrow({
    where: { id: osId },
    include: { cliente: true, produtos: { include: { produto: true } } },
  });
  if (!["CONCLUIDA", "FATURADA"].includes(os.situacao)) throw new FiscalError("Conclua ou fature a OS antes de emitir a nota");
  if (!os.produtos.length) throw new FiscalError("OS sem peças: emita só a NFS-e dos serviços");
  const lanc = await prisma.lancamento.findFirst({ where: { origemTipo: "OS", origemId: osId }, include: { formaPagamento: true } });
  const vNF = os.produtos.reduce((s, i) => s + Number(i.subtotal), 0);
  return emitir({
    modelo: 55, origemTipo: "OS", origemId: os.id, cliente: os.cliente, itens: os.produtos,
    pagamentos: [{ tPag: lanc?.formaPagamento?.tPag ?? "99", valor: Math.round(vNF * 100) / 100, descricao: lanc?.formaPagamento?.nome ?? "A combinar" }],
    infCpl: `OS ${os.numero}`, deps,
  });
}

export async function cancelarNota(notaId: string, justificativa: string, deps: Dependencias = {}) {
  const n = await prisma.notaFiscal.findUniqueOrThrow({ where: { id: notaId } });
  if (n.status !== "AUTORIZADA" || !n.chave || !n.protocolo) throw new FiscalError("Só é possível cancelar nota autorizada");
  if (n.modelo === "NFSE") throw new FiscalError("Use o cancelamento de NFS-e");
  const e = await empresa();
  const cert = deps.cert ?? certificadoDoAmbiente();
  const amb: 1 | 2 = n.ambiente === "PRODUCAO" ? 1 : 2;
  const modelo = n.modelo === "NFCE" ? 65 : 55;
  const idLote = await prisma.$transaction((tx) => proximoNumero(tx, "LOTE-EVENTO"));
  const r = await new ClienteSefaz(cert, e.uf!, amb, deps.transporte).cancelar({
    modelo, chave: n.chave, protocolo: n.protocolo, justificativa, cnpj: e.cnpj, idLote, data: deps.agora,
  });
  if (!r.ok) throw new FiscalError(`SEFAZ recusou o cancelamento: ${r.cStat} - ${r.xMotivo}`);
  return prisma.$transaction(async (tx) => {
    await tx.notaEvento.create({ data: { notaId, tipo: "110111", xml: r.eventoXml + (r.retornoXml ?? ""), protocolo: r.protocolo } });
    return tx.notaFiscal.update({ where: { id: notaId }, data: { status: "CANCELADA", motivo: `${r.cStat} - ${r.xMotivo}` } });
  });
}

// ───────────── NFS-e (serviços da OS) ─────────────

const OP_SIMPLES: Record<RegimeTributario, 1 | 2 | 3> = {
  SIMPLES_NACIONAL: 3, SIMPLES_EXCESSO_SUBLIMITE: 3, MEI: 2, REGIME_NORMAL: 1,
};

export type DependenciasNfse = { cert?: Certificado; transporte?: TransporteRest; agora?: Date };

/** NFS-e (padrão nacional) dos serviços de uma OS concluída/faturada. */
export async function emitirNfseOs(osId: string, deps: DependenciasNfse = {}) {
  const e = await empresa();
  if (!e.inscricaoMunicipal) throw new FiscalError("Informe a inscrição municipal da empresa");
  const os = await prisma.ordemServico.findUniqueOrThrow({
    where: { id: osId },
    include: { cliente: true, servicos: { include: { servico: true } } },
  });
  if (!["CONCLUIDA", "FATURADA"].includes(os.situacao)) throw new FiscalError("Conclua ou fature a OS antes de emitir a NFS-e");
  if (!os.servicos.length) throw new FiscalError("OS sem serviços");
  const ja = await prisma.notaFiscal.findFirst({ where: { origemTipo: "OS", origemId: osId, modelo: "NFSE", status: "AUTORIZADA" } });
  if (ja) throw new FiscalError(`Já existe NFS-e autorizada para esta OS (DPS ${ja.numero})`);
  const codigos = [...new Set(os.servicos.map((s) => s.servico.codigoTributacaoNacional))];
  if (codigos.some((c) => !c)) throw new FiscalError(`Informe o código de tributação nacional dos serviços: ${os.servicos.filter((s) => !s.servico.codigoTributacaoNacional).map((s) => s.servico.nome).join(", ")}`);
  if (codigos.length > 1) throw new FiscalError("A NFS-e aceita um código de serviço por nota: separe os serviços com códigos diferentes em OS distintas");

  const cert = deps.cert ?? certificadoDoAmbiente();
  const amb: 1 | 2 = e.ambienteFiscal === "PRODUCAO" ? 1 : 2;
  const agora = deps.agora ?? new Date();
  const valor = os.servicos.reduce((s, i) => s + Number(i.subtotal), 0);
  const c = os.cliente;
  const serie = "1";
  const nota = await prisma.$transaction(async (tx) => {
    const numero = await proximoNumero(tx, `DPS-${serie}-${amb === 1 ? "P" : "H"}`);
    return tx.notaFiscal.create({
      data: { modelo: "NFSE", serie: 1, numero, ambiente: amb === 1 ? "PRODUCAO" : "HOMOLOGACAO", origemTipo: "OS", origemId: osId, valorTotal: valor },
    });
  });
  try {
    const descricao = [
      ...os.servicos.map((s) => `${Number(s.quantidade)} x ${s.servico.nome}`),
      os.equipamento ? `Equipamento: ${os.equipamento}` : "",
      `OS ${os.numero}`,
    ].filter(Boolean).join(" | ");
    const { xml } = montarDps({
      tpAmb: amb, emissao: agora, competencia: os.saida ?? agora, serie, numero: nota.numero,
      prestador: { cnpj: e.cnpj, im: e.inscricaoMunicipal, codigoMunicipio: e.codigoMunicipio!, fone: e.telefone, email: e.email, opSimpNac: OP_SIMPLES[e.regimeTributario] },
      tomador: c.documento ? {
        documento: c.documento, nome: c.nome, email: c.email, fone: c.telefone,
        endereco: c.codigoMunicipio && c.cep && c.logradouro && c.bairro
          ? { codigoMunicipio: c.codigoMunicipio, cep: c.cep, logradouro: c.logradouro, numero: c.numero ?? "SN", complemento: c.complemento, bairro: c.bairro } : null,
      } : null,
      servico: {
        codigoMunicipioPrestacao: e.codigoMunicipio!, cTribNac: codigos[0]!, cNBS: os.servicos[0].servico.codigoNbs,
        descricao, valor, aliquotaIss: os.servicos[0].servico.aliquotaIss == null ? null : Number(os.servicos[0].servico.aliquotaIss),
      },
    });
    const assinada = assinarDps(xml, cert);
    await prisma.notaFiscal.update({ where: { id: nota.id }, data: { status: "ASSINADA", xml: assinada } });
    const r = await new ClienteNfse(cert, amb, deps.transporte).emitir(assinada);
    if (r.ok) {
      return prisma.notaFiscal.update({
        where: { id: nota.id },
        data: { status: "AUTORIZADA", chave: r.chave, xml: r.xmlNfse ?? assinada, motivo: r.mensagem, emitidaEm: agora },
      });
    }
    return prisma.notaFiscal.update({ where: { id: nota.id }, data: { status: "REJEITADA", motivo: r.mensagem.slice(0, 1000) } });
  } catch (err) {
    await prisma.notaFiscal.update({ where: { id: nota.id }, data: { status: "REJEITADA", motivo: (err as Error).message.slice(0, 500) } });
    throw err;
  }
}

export async function cancelarNfse(notaId: string, cMotivo: 1 | 2 | 9, motivo: string, deps: DependenciasNfse = {}) {
  const n = await prisma.notaFiscal.findUniqueOrThrow({ where: { id: notaId } });
  if (n.modelo !== "NFSE" || n.status !== "AUTORIZADA" || !n.chave) throw new FiscalError("Só é possível cancelar NFS-e autorizada");
  const e = await empresa();
  const r = await new ClienteNfse(deps.cert ?? certificadoDoAmbiente(), n.ambiente === "PRODUCAO" ? 1 : 2, deps.transporte)
    .cancelar({ cnpj: e.cnpj, chave: n.chave, cMotivo, motivo, data: deps.agora });
  if (!r.ok) throw new FiscalError(`Cancelamento recusado: ${r.mensagem}`);
  return prisma.$transaction(async (tx) => {
    await tx.notaEvento.create({ data: { notaId, tipo: "101101", xml: r.eventoXml ?? r.pedidoXml } });
    return tx.notaFiscal.update({ where: { id: notaId }, data: { status: "CANCELADA", motivo: r.mensagem } });
  });
}
