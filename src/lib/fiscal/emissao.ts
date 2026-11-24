import type { Prisma, Empresa, ModeloNota, OrigemDocumento, Pessoa, RegimeTributario } from "@prisma/client";
import { dividirDesconto } from "./desconto";
import { empresaDosServicos } from "@/lib/os/faturamento";
import { prisma } from "@/lib/db";
import { proximoNumero } from "@/lib/sequencia";
import { assinarXml } from "./assinatura";
import { certificadoDaEmpresa, conferirTls, NaoEnviadoError, type Certificado } from "./certificado";
import { codigoIbge, completarEndereco } from "@/lib/cadastros/municipio";
import { empresaDoDocumento } from "@/lib/empresa/atual";
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

/**
 * Empresa emitente: a dona do documento (empresaId da venda/OS/nota) ou, sem ela, a loja atual.
 * Cada CNPJ tem seus dados, certificado, ambiente, séries e numeração.
 */
export async function empresa(empresaId?: string | null): Promise<Empresa> {
  let e = await empresaDoDocumento(empresaId);
  if (!e) throw new FiscalError("Cadastre os dados da empresa em Configurações › Empresas (lojas)");
  if (!e.codigoMunicipio && e.cidade && e.uf) {
    const c = await codigoIbge(e.cidade, e.uf);
    if (c) e = await prisma.empresa.update({ where: { id: e.id }, data: { codigoMunicipio: c } });
  }
  const faltando = [
    ["logradouro", e.logradouro], ["bairro", e.bairro], ["cidade", e.cidade],
    ["UF", e.uf], ["CEP", e.cep],
  ].filter(([, v]) => !v).map(([n]) => n);
  if (faltando.length) throw new FiscalError(`Complete os dados da empresa: ${faltando.join(", ")}`);
  return e;
}

function emitenteDe(e: Empresa): DadosNota["emitente"] {
  return {
    cnpj: e.cnpj, razaoSocial: e.razaoSocial, nomeFantasia: e.nomeFantasia, ie: e.inscricaoEstadual!, im: e.inscricaoMunicipal,
    cnae: e.cnae, crt: CRT[e.regimeTributario],
    endereco: {
      logradouro: e.logradouro!, numero: e.numero ?? "SN", complemento: e.complemento, bairro: e.bairro!, codigoMunicipio: e.codigoMunicipio!,
      municipio: e.cidade!, uf: e.uf!, cep: e.cep!, telefone: e.telefone,
    },
  };
}

async function destinatarioDe(p: Pessoa | null, obrigatorio: boolean): Promise<Destinatario | null> {
  if (p?.tipoPessoa === "ESTRANGEIRO") throw new FiscalError("Nota para cliente estrangeiro (exportação) ainda não é emitida pelo sistema");
  if (!p || !p.documento) {
    if (obrigatorio) throw new FiscalError("NF-e exige cliente com CPF/CNPJ");
    return null;
  }
  // código IBGE (e o que mais faltar) descoberto pela cidade/UF ou pelo CEP e gravado no cadastro;
  // na NFC-e o endereço é opcional: só entra se estiver completo
  if (obrigatorio) p = await completarEndereco(p);
  const completo = p.logradouro && p.bairro && p.codigoMunicipio && p.cidade && p.uf && p.cep;
  if (obrigatorio && !completo) {
    const falta = [
      ["rua", p.logradouro], ["bairro", p.bairro], ["cidade", p.cidade], ["UF", p.uf], ["CEP", p.cep],
    ].filter(([, v]) => !v).map(([n]) => n);
    throw new FiscalError(falta.length
      ? `Para a NF-e, complete no cadastro do cliente ${p.nome}: ${falta.join(", ")}`
      : `Não encontrei a cidade "${p.cidade}/${p.uf}" do cliente ${p.nome} na lista do IBGE: confira o nome da cidade no cadastro`);
  }
  return {
    documento: p.documento!,
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
  /** item avulso: descrição digitada (sem cadastro de produto) */
  descricao?: string | null;
  produto: { codigo: string; gtin: string | null; nome: string; ncm: string | null; cest: string | null; unidade: string; origem: number; cfopInterno: string | null; cfopExterno: string | null; csosn: string | null; cstIcms: string | null; aliquotaIcms: unknown; cstPis: string | null; cstCofins: string | null };
};

function itensDe(itens: ItemOrigem[], interestadual: boolean): ItemNota[] {
  const avulsos = itens.filter((i) => i.descricao);
  if (avulsos.length) throw new FiscalError(`Item avulso não tem NCM nem dados fiscais (${avulsos.map((i) => i.descricao).join(", ")}): troque por um produto cadastrado para emitir a nota`);
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

export { dividirDesconto };

/** Numeração: um contador por CNPJ, modelo, série e ambiente. */
export const chaveSeq = (cnpj: string, modelo: 55 | 65, serie: number, amb: 1 | 2) => `NF-${cnpj}-${modelo}-${serie}-${amb === 1 ? "P" : "H"}`;
/** Numeração da DPS (NFS-e): por CNPJ, série e ambiente. */
export const chaveDps = (cnpj: string, serie: number, amb: 1 | 2) => `DPS-${cnpj}-${serie}-${amb === 1 ? "P" : "H"}`;

async function emitir(args: {
  modelo: 55 | 65;
  origemTipo: OrigemDocumento;
  origemId: string;
  empresaId?: string | null;
  cliente: Pessoa | null;
  itens: ItemOrigem[];
  pagamentos: PagamentoNota[];
  desconto?: number;
  infCpl?: string;
  deps: Dependencias;
}) {
  const e = await empresa(args.empresaId);
  const amb: 1 | 2 = e.ambienteFiscal === "PRODUCAO" ? 1 : 2;
  const nfce = args.modelo === 65;
  if (!e.inscricaoEstadual || !/^\d+$/.test(e.inscricaoEstadual))
    throw new FiscalError(`A empresa ${e.nomeFantasia || e.razaoSocial} não tem inscrição estadual: NF-e e NFC-e só saem por CNPJ com IE (configure em Configurações › Empresas)`);
  if (nfce && (!e.cscId || !e.cscToken)) throw new FiscalError("Configure o CSC da NFC-e (ID e código) em Configurações › Empresas");
  const jaAutorizada = await prisma.notaFiscal.findFirst({
    where: { origemTipo: args.origemTipo, origemId: args.origemId, status: "AUTORIZADA", modelo: nfce ? "NFCE" : "NFE" },
  });
  if (jaAutorizada) throw new FiscalError(`Já existe nota autorizada para este documento (nº ${jaAutorizada.numero})`);
  // nota enviada sem resposta da SEFAZ: pode ter sido autorizada. Emitir outra com outro número duplicaria a venda.
  const pendente = await prisma.notaFiscal.findFirst({
    where: { origemTipo: args.origemTipo, origemId: args.origemId, status: "ENVIADA", modelo: nfce ? "NFCE" : "NFE" },
  });
  if (pendente) throw new FiscalError(`A nota nº ${pendente.numero} foi enviada e a SEFAZ não respondeu: abra a nota e clique em "Consultar na SEFAZ" antes de emitir outra`);

  const cert = args.deps.cert ?? certificadoDaEmpresa(e);
  const dest = await destinatarioDe(args.cliente, !nfce);
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

  conferirTls(cert); // certificado que não abre a conexão: avisa antes de gastar um número
  let enviou = false;
  const chave = chaveSeq(e.cnpj, args.modelo, serie, amb);
  // reserva o número numa transação própria (número consumido mesmo se rejeitar → inutilizar depois)
  const nota = await prisma.$transaction(async (tx) => {
    const numero = await proximoNumero(tx, chave);
    return tx.notaFiscal.create({
      data: { empresaId: e.id, cnae: e.cnae, modelo: modeloEnum, serie, numero, ambiente: amb === 1 ? "PRODUCAO" : "HOMOLOGACAO", origemTipo: args.origemTipo, origemId: args.origemId, valorTotal: 0 },
    });
  });

  try {
    const montada = montarNfe({
      modelo: args.modelo, serie, numero: nota.numero, cNF: codigoNumerico(nota.numero), emissao: agora, tpAmb: amb,
      naturezaOperacao: "Venda de mercadoria", consumidorFinal: !dest || dest.indIEDest === 9, presenca: 1,
      emitente: emitenteDe(e), destinatario: dest, itens, pagamentos: args.pagamentos,
      infCpl: [args.infCpl, e.infCplNfe].filter(Boolean).join(" | ") || undefined,
    });
    let xml = montada.xml;
    if (nfce) xml = incluirInfNFeSupl(xml, qrCodeNfce(montada.chave, amb, e.cscId!, e.cscToken!), amb);
    const assinada = assinarXml(xml, cert, { tag: "infNFe", pai: "NFe" });
    await prisma.notaFiscal.update({ where: { id: nota.id }, data: { chave: montada.chave, status: "ASSINADA", xml: assinada, valorTotal: montada.totais.vNF } });

    const cli = new ClienteSefaz(cert, e.uf!, amb, args.deps.transporte);
    enviou = true;
    const r = await cli.autorizar(assinada, args.modelo, nota.numero);
    const motivo = `${r.cStat} - ${r.xMotivo}`;
    // sem protocolo (lote recebido/em processamento): o resultado sai depois, pela consulta
    if (!r.protXml && !r.autorizada && ["103", "105"].includes(r.cStat))
      return prisma.notaFiscal.update({ where: { id: nota.id }, data: { status: "ENVIADA", motivo: `${motivo}. Consulte a nota na SEFAZ em instantes.` } });
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
    // erro depois de mandar (tempo esgotado, conexão caiu): a SEFAZ pode ter autorizado; fica "enviada" até a consulta
    const m = (err as Error).message.slice(0, 400);
    // nada chegou à SEFAZ (erro ao montar, assinar ou conectar): o número volta para ser usado de novo
    if (!enviou || err instanceof NaoEnviadoError) await liberarNumero(nota.id, chave, nota.numero, m);
    else await prisma.notaFiscal.update({ where: { id: nota.id }, data: { status: "ENVIADA", motivo: `Sem resposta da SEFAZ: ${m}. Consulte a nota antes de emitir de novo.` } });
    throw err;
  }
}

/**
 * A nota não chegou a ser enviada: apaga o rascunho e, se o número ainda é o último da série, devolve o número
 * ao contador (a próxima nota usa o mesmo). Se outra nota já pegou o seguinte, fica registrada como rejeitada
 * (e o número aparece em Inutilizar numeração).
 */
async function liberarNumero(notaId: string, chave: string, numero: number, motivo: string) {
  await prisma.$transaction(async (tx) => {
    const volta = await tx.sequencia.updateMany({ where: { chave, valor: numero }, data: { valor: numero - 1 } });
    if (volta.count) await tx.notaFiscal.delete({ where: { id: notaId } });
    else await tx.notaFiscal.update({ where: { id: notaId }, data: { status: "REJEITADA", motivo: `Não enviada: ${motivo}` } });
  });
}

/** Consulta na SEFAZ uma nota que ficou sem resposta e grava o resultado (autorizada ou rejeitada). */
export async function consultarNota(notaId: string, deps: Dependencias = {}) {
  const n = await prisma.notaFiscal.findUniqueOrThrow({ where: { id: notaId } });
  if (n.modelo === "NFSE") throw new FiscalError("A consulta é só para NF-e e NFC-e");
  if (!n.chave || !n.xml) throw new FiscalError("A nota não chegou a ser assinada: não há o que consultar");
  if (n.status === "CANCELADA") return n;
  const e = await empresa(n.empresaId);
  const amb: 1 | 2 = n.ambiente === "PRODUCAO" ? 1 : 2;
  const r = await new ClienteSefaz(deps.cert ?? certificadoDaEmpresa(e), e.uf!, amb, deps.transporte).consultar(n.chave, n.modelo === "NFCE" ? 65 : 55);
  const motivo = `${r.cStat} - ${r.xMotivo}`;
  if (r.cancelada) return prisma.notaFiscal.update({ where: { id: n.id }, data: { status: "CANCELADA", motivo, consultadaEm: new Date() } });
  // já autorizada aqui: só confirma (o XML de distribuição já está guardado)
  if (n.status === "AUTORIZADA") return prisma.notaFiscal.update({ where: { id: n.id }, data: { motivo, consultadaEm: new Date() } });
  if (r.autorizada && r.protXml)
    return prisma.notaFiscal.update({ where: { id: n.id }, data: { status: "AUTORIZADA", xml: montarProc(n.xml, r.protXml), protocolo: r.protocolo, motivo, emitidaEm: n.emitidaEm ?? new Date(), consultadaEm: new Date() } });
  const temProt = !!r.protXml; // protocolo de rejeição da própria nota
  if (r.naoConsta || temProt)
    return prisma.notaFiscal.update({ where: { id: n.id }, data: { status: "REJEITADA", motivo, consultadaEm: new Date() } });
  return prisma.notaFiscal.update({ where: { id: n.id }, data: { motivo: `${motivo}. Ainda em processamento: consulte de novo em instantes.`, consultadaEm: new Date() } });
}

/** NFC-e (modelo 65) ou NF-e (55) de uma venda concluída. */
export async function emitirNotaVenda(vendaId: string, modelo: 55 | 65, deps: Dependencias = {}) {
  const v = await prisma.venda.findUniqueOrThrow({
    where: { id: vendaId },
    include: { cliente: true, itens: { include: { produto: true } }, servicos: { select: { subtotal: true } }, pagamentos: { include: { formaPagamento: true } }, parcelas: { include: { formaPagamento: true } } },
  });
  if (v.situacao !== "CONCLUIDA") throw new FiscalError("Conclua a venda antes de emitir a nota");
  if (!v.itens.length) throw new FiscalError("Venda sem produtos");
  // PDV guarda os pagamentos; o pedido guarda as parcelas. Na NF-e entram só os produtos.
  const brutoProd = v.itens.reduce((s, i) => s + Number(i.subtotal), 0);
  const desc = dividirDesconto(brutoProd, v.servicos.reduce((s, i) => s + Number(i.subtotal), 0), Number(v.desconto)).produtos;
  const vProd = brutoProd - desc;
  const pagamentos = v.pagamentos.length
    ? v.pagamentos.map((p) => ({ tPag: p.formaPagamento.tPag, valor: Number(p.valor), descricao: p.formaPagamento.nome }))
    : [{ tPag: v.parcelas[0]?.formaPagamento?.tPag ?? "99", valor: Math.round(vProd * 100) / 100, descricao: v.parcelas[0]?.formaPagamento?.nome ?? "A combinar" }];
  return emitir({
    modelo, origemTipo: "VENDA", origemId: v.id, empresaId: v.empresaId, cliente: v.cliente, itens: v.itens, pagamentos,
    desconto: desc, infCpl: `Venda ${v.numero}`, deps,
  });
}

/** NF-e das peças de uma OS faturada/concluída (os serviços vão na NFS-e). */
export async function emitirNotaOs(osId: string, deps: Dependencias = {}) {
  const os = await prisma.ordemServico.findUniqueOrThrow({
    where: { id: osId },
    include: { cliente: true, produtos: { include: { produto: true } }, servicos: { select: { subtotal: true } } },
  });
  if (!["CONCLUIDA", "FATURADA"].includes(os.situacao)) throw new FiscalError("Conclua ou fature a OS antes de emitir a nota");
  if (!os.produtos.length) throw new FiscalError("OS sem peças: emita só a NFS-e dos serviços");
  // serviços por outra empresa: a forma de pagamento da nota é a da conta das peças (a da empresa da OS)
  const servicosFora = empresaDosServicos(os);
  const lanc = await prisma.lancamento.findFirst({ where: { origemTipo: "OS", origemId: osId, ...(servicosFora ? { NOT: { empresaId: servicosFora } } : {}) }, include: { formaPagamento: true } });
  const brutoProd = os.produtos.reduce((s, i) => s + Number(i.subtotal), 0);
  const desc = dividirDesconto(brutoProd, os.servicos.reduce((s, i) => s + Number(i.subtotal), 0), Number(os.desconto)).produtos;
  const vNF = brutoProd - desc;
  return emitir({
    modelo: 55, origemTipo: "OS", origemId: os.id, empresaId: os.empresaId, cliente: os.cliente, itens: os.produtos,
    pagamentos: [{ tPag: lanc?.formaPagamento?.tPag ?? "99", valor: Math.round(vNF * 100) / 100, descricao: lanc?.formaPagamento?.nome ?? "A combinar" }],
    desconto: desc, infCpl: `OS ${os.numero}`, deps,
  });
}

export async function cancelarNota(notaId: string, justificativa: string, deps: Dependencias = {}) {
  const n = await prisma.notaFiscal.findUniqueOrThrow({ where: { id: notaId } });
  if (n.status !== "AUTORIZADA" || !n.chave || !n.protocolo) throw new FiscalError("Só é possível cancelar nota autorizada");
  if (n.modelo === "NFSE") throw new FiscalError("Use o cancelamento de NFS-e");
  const e = await empresa(n.empresaId);
  const cert = deps.cert ?? certificadoDaEmpresa(e);
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
  const os = await prisma.ordemServico.findUniqueOrThrow({
    where: { id: osId },
    include: { cliente: true, servicos: { include: { servico: true } }, produtos: { select: { subtotal: true } }, equipamentos: { orderBy: { ordem: "asc" } } },
  });
  if (!["CONCLUIDA", "FATURADA"].includes(os.situacao)) throw new FiscalError("Conclua ou fature a OS antes de emitir a NFS-e");
  return emitirNfse({
    // os serviços podem ser faturados por outra empresa do grupo (ex.: VFX): a NFS-e sai pelo CNPJ/certificado dela
    origemTipo: "OS", origemId: osId, empresaId: empresaDosServicos(os) ?? os.empresaId, rotulo: "OS", referencia: `OS ${os.numero}`, cliente: os.cliente, servicos: os.servicos,
    extras: os.equipamentos.map((q) => `Equipamento: ${[q.equipamento, q.marca, q.modelo, q.serie].filter(Boolean).join(" ")}`),
    competencia: os.saida ?? undefined,
    desconto: dividirDesconto(os.produtos.reduce((s, i) => s + Number(i.subtotal), 0), os.servicos.reduce((s, i) => s + Number(i.subtotal), 0), Number(os.desconto)).servicos,
  }, deps);
}

/** NFS-e dos serviços de uma venda concretizada. */
export async function emitirNfseVenda(vendaId: string, deps: DependenciasNfse = {}) {
  const v = await prisma.venda.findUniqueOrThrow({ where: { id: vendaId }, include: { cliente: true, servicos: { include: { servico: true } }, itens: { select: { subtotal: true } } } });
  if (v.situacao !== "CONCLUIDA") throw new FiscalError("Concretize a venda antes de emitir a NFS-e");
  if (!v.cliente) throw new FiscalError("Informe o cliente da venda");
  return emitirNfse({ origemTipo: "VENDA", origemId: vendaId, empresaId: v.empresaId, rotulo: "venda", referencia: `Venda ${v.numero}`, cliente: v.cliente, servicos: v.servicos, extras: [], competencia: v.data,
    desconto: dividirDesconto(v.itens.reduce((s, i) => s + Number(i.subtotal), 0), v.servicos.reduce((s, i) => s + Number(i.subtotal), 0), Number(v.desconto)).servicos }, deps);
}

type Tomador = { documento: string | null; nome: string; email: string | null; telefone: string | null; codigoMunicipio: string | null; cep: string | null; logradouro: string | null; numero: string | null; complemento: string | null; bairro: string | null };
type ServicoNota = { quantidade: Prisma.Decimal; subtotal: Prisma.Decimal; servico: { nome: string; cnae?: string | null; codigoTributacaoNacional: string | null; codigoNbs: string | null; aliquotaIss: Prisma.Decimal | null } };

async function emitirNfse(a: { origemTipo: "OS" | "VENDA"; origemId: string; empresaId?: string | null; rotulo: string; referencia: string; cliente: Tomador; servicos: ServicoNota[]; extras: string[]; competencia?: Date; desconto?: number }, deps: DependenciasNfse) {
  const e = await empresa(a.empresaId);
  if (!e.inscricaoMunicipal) throw new FiscalError("Informe a inscrição municipal da empresa");
  if (!a.servicos.length) throw new FiscalError(`A ${a.rotulo === "OS" ? "OS" : "venda"} não tem serviços`);
  const ja = await prisma.notaFiscal.findFirst({ where: { origemTipo: a.origemTipo, origemId: a.origemId, modelo: "NFSE", status: "AUTORIZADA" } });
  if (ja) throw new FiscalError(`Já existe NFS-e autorizada para esta ${a.rotulo} (DPS ${ja.numero})`);
  const codigos = [...new Set(a.servicos.map((s) => s.servico.codigoTributacaoNacional))];
  if (codigos.some((c) => !c)) throw new FiscalError(`Informe o código de tributação nacional dos serviços: ${a.servicos.filter((s) => !s.servico.codigoTributacaoNacional).map((s) => s.servico.nome).join(", ")}`);
  if (codigos.length > 1) throw new FiscalError(`A NFS-e aceita um código de serviço por nota: separe os serviços com códigos diferentes`);

  const cert = deps.cert ?? certificadoDaEmpresa(e);
  const amb: 1 | 2 = e.ambienteNfse === "PRODUCAO" ? 1 : 2;
  const agora = deps.agora ?? new Date();
  // valor do serviço já com a parte do desconto geral (o que foi cobrado do cliente)
  const valor = Math.round((a.servicos.reduce((s, i) => s + Number(i.subtotal), 0) - (a.desconto ?? 0)) * 100) / 100;
  if (!(valor > 0)) throw new FiscalError("O valor dos serviços (com o desconto) precisa ser maior que zero");
  const c = a.cliente;
  const serie = String(e.serieDps);
  conferirTls(cert);
  const chave = chaveDps(e.cnpj, e.serieDps, amb);
  let enviou = false;
  const nota = await prisma.$transaction(async (tx) => {
    const numero = await proximoNumero(tx, chave);
    return tx.notaFiscal.create({
      data: { empresaId: e.id, cnae: a.servicos[0]?.servico.cnae?.replace(/\D/g, "") || e.cnae, modelo: "NFSE", serie: e.serieDps, numero, ambiente: amb === 1 ? "PRODUCAO" : "HOMOLOGACAO", origemTipo: a.origemTipo, origemId: a.origemId, valorTotal: valor },
    });
  });
  try {
    const descricao = [...a.servicos.map((s) => `${Number(s.quantidade)} x ${s.servico.nome}`), ...a.extras, a.referencia, e.infCplNfse].filter(Boolean).join(" | ");
    const { xml } = montarDps({
      tpAmb: amb, emissao: agora, competencia: a.competencia ?? agora, serie, numero: nota.numero,
      prestador: { cnpj: e.cnpj, im: e.inscricaoMunicipal, codigoMunicipio: e.codigoMunicipio!, fone: e.telefone, email: e.email, opSimpNac: OP_SIMPLES[e.regimeTributario], regEspTrib: e.regimeEspecialNfse },
      tomador: c.documento ? {
        documento: c.documento, nome: c.nome, email: c.email, fone: c.telefone,
        endereco: c.codigoMunicipio && c.cep && c.logradouro && c.bairro
          ? { codigoMunicipio: c.codigoMunicipio, cep: c.cep, logradouro: c.logradouro, numero: c.numero ?? "SN", complemento: c.complemento, bairro: c.bairro } : null,
      } : null,
      servico: {
        codigoMunicipioPrestacao: e.codigoMunicipio!, cTribNac: codigos[0]!, cNBS: a.servicos[0].servico.codigoNbs,
        descricao, valor, aliquotaIss: a.servicos[0].servico.aliquotaIss == null ? null : Number(a.servicos[0].servico.aliquotaIss),
      },
    });
    const assinada = assinarDps(xml, cert);
    await prisma.notaFiscal.update({ where: { id: nota.id }, data: { status: "ASSINADA", xml: assinada } });
    enviou = true;
    const r = await new ClienteNfse(cert, amb, deps.transporte).emitir(assinada);
    if (r.ok) {
      return prisma.notaFiscal.update({
        where: { id: nota.id },
        data: { status: "AUTORIZADA", chave: r.chave, xml: r.xmlNfse ?? assinada, motivo: r.mensagem, emitidaEm: agora },
      });
    }
    return prisma.notaFiscal.update({ where: { id: nota.id }, data: { status: "REJEITADA", motivo: r.mensagem.slice(0, 1000) } });
  } catch (err) {
    const m = (err as Error).message.slice(0, 500);
    if (!enviou || err instanceof NaoEnviadoError) await liberarNumero(nota.id, chave, nota.numero, m);
    else await prisma.notaFiscal.update({ where: { id: nota.id }, data: { status: "REJEITADA", motivo: m } });
    throw err;
  }
}

export async function cancelarNfse(notaId: string, cMotivo: 1 | 2 | 9, motivo: string, deps: DependenciasNfse = {}) {
  const n = await prisma.notaFiscal.findUniqueOrThrow({ where: { id: notaId } });
  if (n.modelo !== "NFSE" || n.status !== "AUTORIZADA" || !n.chave) throw new FiscalError("Só é possível cancelar NFS-e autorizada");
  const e = await empresa(n.empresaId);
  const r = await new ClienteNfse(deps.cert ?? certificadoDaEmpresa(e), n.ambiente === "PRODUCAO" ? 1 : 2, deps.transporte)
    .cancelar({ cnpj: e.cnpj, chave: n.chave, cMotivo, motivo, data: deps.agora });
  if (!r.ok) throw new FiscalError(`Cancelamento recusado: ${r.mensagem}`);
  return prisma.$transaction(async (tx) => {
    await tx.notaEvento.create({ data: { notaId, tipo: "101101", xml: r.eventoXml ?? r.pedidoXml } });
    return tx.notaFiscal.update({ where: { id: notaId }, data: { status: "CANCELADA", motivo: r.mensagem } });
  });
}
