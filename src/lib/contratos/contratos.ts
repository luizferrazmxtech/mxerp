import { Prisma, type Contrato, type PapelUsuario } from "@prisma/client";
import { prisma, type Tx } from "@/lib/db";
import { naLoja } from "@/lib/empresa/loja";
import { empresaDoDocumento } from "@/lib/empresa/atual";
import { diaSP, parseDia, somarDias } from "@/lib/datas";
import { proximoNumero } from "@/lib/sequencia";
import { ATIVOS, boletosDoDocumento, pdfBoleto, contextoBoletos, baseLinks } from "@/lib/financeiro/boletos";
import type { ClienteInter } from "@/lib/financeiro/inter";
import { emitirNfseVenda, type DependenciasNfse } from "@/lib/fiscal/emissao";
import { salvarPedido } from "@/lib/vendas/pedidos";
import { descontoLinha, subtotalServico, type DadosOrcamento } from "@/lib/orcamentos/tipos";
import { enviarEmail, preencher, type Transporte } from "@/lib/email/email";
import { configContratos, situacaoVendaContrato } from "./config";
import { n, primeiroVencimento, referencia, totaisContrato, vencimentoSeguinte, type DadosContrato, type PeriodicidadeContrato } from "./tipos";

/**
 * Contratos (serviços recorrentes): a cada vencimento, N dias antes, gera uma venda de serviços com o
 * financeiro lançado (e o boleto do Inter, se a forma for boleto), emite a NFS-e se pedido e manda o boleto e o
 * lembrete de pagamento por e-mail. Roda pelo agendador (/api/contratos/processar) e pelo botão "Processar agora".
 */

type Usuario = { id: string; nome: string; papel?: PapelUsuario };
export class ContratoError extends Error {}

const t = (s: string | undefined | null) => (s ?? "").trim() || null;
const D = (v: number) => new Prisma.Decimal(v.toFixed(2));
const dataBr = (d: Date) => d.toLocaleDateString("pt-BR", { timeZone: "UTC" });
const iso = (d: Date) => d.toISOString().slice(0, 10);
const brl = (v: number) => v.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const msg = (e: unknown) => (e instanceof Error ? e.message : String(e)).slice(0, 500);

// ───────────────────────── cadastro

export async function proximoNumeroContrato() {
  const [s, m] = await Promise.all([prisma.sequencia.findUnique({ where: { chave: "CONTRATO" } }), prisma.contrato.aggregate({ _max: { numero: true } })]);
  return Math.max(s?.valor ?? 0, m._max.numero ?? 0) + 1;
}

/** O contrato já terminou? (data final ou número de cobranças) */
function terminou(c: Pick<Contrato, "termino" | "dataFim" | "totalCobrancas" | "cobrancasGeradas" | "proximoVencimento">) {
  if (c.termino === "DATA" && c.dataFim) return c.proximoVencimento > c.dataFim;
  if (c.termino === "VEZES" && c.totalCobrancas) return c.cobrancasGeradas >= c.totalCobrancas;
  return false;
}

export async function salvarContrato(d: DadosContrato, u: Usuario, id?: string) {
  if (!t(d.clienteId)) throw new ContratoError("Informe o cliente");
  if (!t(d.dataInicio)) throw new ContratoError("Informe a data do contrato");
  const servicos = d.servicos.filter((l) => l.servicoId);
  if (!servicos.length) throw new ContratoError("Adicione ao menos um serviço");
  for (const l of servicos) if (!(n(l.quantidade) > 0)) throw new ContratoError(`Informe a quantidade de ${l.nome || "todos os serviços"}`);
  const tot = totaisContrato({ ...d, servicos });
  if (!(tot.total > 0)) throw new ContratoError("O valor de cada cobrança precisa ser maior que zero");
  const dia = Math.trunc(n(d.diaVencimento));
  if (!(dia >= 1 && dia <= 31)) throw new ContratoError("O dia do vencimento vai de 1 a 31");
  const inicio = parseDia(d.dataInicio);
  const proximo = t(d.proximoVencimento) ? parseDia(d.proximoVencimento) : primeiroVencimento(inicio, dia);
  const antecedencia = Math.trunc(n(d.diasAntecedencia));
  if (antecedencia < 0 || antecedencia > 60) throw new ContratoError("Os dias de antecedência vão de 0 a 60");
  const diasLembrete = d.lembrete ? Math.trunc(n(d.diasLembrete)) : null;
  if (diasLembrete != null && (diasLembrete < 0 || diasLembrete > 60)) throw new ContratoError("Os dias do lembrete vão de 0 a 60");
  if (d.enviarBoleto && diasLembrete != null && diasLembrete >= antecedencia)
    throw new ContratoError("O lembrete precisa sair mais perto do vencimento que a cobrança (menos dias antes)");
  const dataFim = d.termino === "DATA" ? (t(d.dataFim) ? parseDia(d.dataFim) : null) : null;
  if (d.termino === "DATA" && !dataFim) throw new ContratoError("Informe até quando vai o contrato");
  const totalCobrancas = d.termino === "VEZES" ? Math.trunc(n(d.totalCobrancas)) : null;
  if (d.termino === "VEZES" && !(totalCobrancas! > 0)) throw new ContratoError("Informe quantas cobranças o contrato tem");
  const email = t(d.emailCobranca);
  if (email && email.split(/[;,]/).some((e) => !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(e.trim()))) throw new ContratoError("E-mail de cobrança inválido");

  const dados = {
    clienteId: d.clienteId, vendedorId: t(d.vendedorId), situacao: d.situacao, canal: t(d.canal) ?? "Presencial", centroCusto: t(d.centroCusto),
    dataInicio: inicio, periodicidade: d.periodicidade, diaVencimento: dia, proximoVencimento: proximo,
    termino: d.termino, dataFim, totalCobrancas,
    totalServicos: D(tot.servicos), desconto: D(tot.desconto), descontoPercentual: d.descontoPct ? new Prisma.Decimal(n(d.desconto)) : null, total: D(tot.total),
    formaPagamentoId: t(d.formaPagamentoId), diasAntecedencia: antecedencia, enviarBoleto: d.enviarBoleto, diasLembrete, emitirNota: d.emitirNota,
    emailCobranca: email, observacoes: t(d.observacoes), observacaoInterna: t(d.observacaoInterna),
  };
  const linhas = (contratoId: string) => servicos.map((l, i) => ({
    contratoId, ordem: i, servicoId: l.servicoId, detalhes: t(l.detalhes), quantidade: new Prisma.Decimal(n(l.quantidade)), valorUnit: D(n(l.valorUnit)),
    desconto: D(descontoLinha(n(l.quantidade) * n(l.valorUnit), l.desconto, l.descontoPct)), subtotal: D(subtotalServico(l)),
  }));
  const numeroInformado = Math.trunc(n(d.numero));

  return prisma.$transaction(async (tx) => {
    if (id) {
      const atual = await tx.contrato.findUniqueOrThrow({ where: { id } });
      const numero = numeroInformado > 0 ? numeroInformado : atual.numero;
      if (numero !== atual.numero && (await tx.contrato.findUnique({ where: { numero } }))) throw new ContratoError(`Já existe o contrato nº ${numero}`);
      await tx.contrato.update({ where: { id }, data: { ...dados, numero } });
      await tx.contratoServico.deleteMany({ where: { contratoId: id } });
      await tx.contratoServico.createMany({ data: linhas(id) });
      await tx.contratoHistorico.create({ data: { contratoId: id, descricao: atual.situacao !== d.situacao ? `Contrato alterado (situação: ${d.situacao.toLowerCase().replace("_", " ")})` : "Contrato alterado", usuarioNome: u.nome } });
      return tx.contrato.findUniqueOrThrow({ where: { id } });
    }
    let numero = numeroInformado;
    if (numero > 0) {
      if (await tx.contrato.findUnique({ where: { numero } })) throw new ContratoError(`Já existe o contrato nº ${numero}`);
      await tx.$executeRaw`INSERT INTO "Sequencia" (chave, valor) VALUES ('CONTRATO', ${numero}) ON CONFLICT (chave) DO UPDATE SET valor = GREATEST("Sequencia".valor, ${numero})`;
    } else {
      do numero = await proximoNumero(tx, "CONTRATO"); while (await tx.contrato.findUnique({ where: { numero } }));
    }
    const c = await tx.contrato.create({ data: { ...dados, numero, criadoPorId: u.id || null } });
    await tx.contratoServico.createMany({ data: linhas(c.id) });
    await tx.contratoHistorico.create({ data: { contratoId: c.id, descricao: "Contrato cadastrado no sistema", usuarioNome: u.nome } });
    return c;
  });
}

export async function alterarSituacaoContrato(id: string, situacao: Contrato["situacao"], u: Usuario) {
  await prisma.contrato.update({ where: { id }, data: { situacao, historico: { create: { descricao: `Situação alterada para ${situacao.toLowerCase().replace("_", " ")}`, usuarioNome: u.nome } } } });
}

/** Exclui só contrato sem cobranças geradas (os outros são cancelados, para manter o histórico). */
export async function excluirContrato(id: string) {
  const geradas = await prisma.contratoCobranca.count({ where: { contratoId: id, vendaId: { not: null } } });
  if (geradas) throw new ContratoError("O contrato já gerou vendas: mude a situação para Cancelado ou Finalizado em vez de excluir");
  await prisma.contrato.delete({ where: { id } });
}

// ───────────────────────── cobranças

/**
 * Abre as cobranças cujo dia de gerar (vencimento − antecedência) já chegou e avança o próximo vencimento.
 * Com `agora`, abre a próxima do contrato mesmo antes do prazo (botão "Gerar cobrança agora").
 */
async function abrirCobrancas(tx: Tx, contratoId: string, hoje: Date, agora = false) {
  await tx.$queryRaw`SELECT id FROM "Contrato" WHERE id = ${contratoId} FOR NO KEY UPDATE`;
  let c = await tx.contrato.findUniqueOrThrow({ where: { id: contratoId } });
  const abertas: string[] = [];
  for (let i = 0; i < 24; i++) {
    if (c.situacao !== "ATIVO") break;
    if (terminou(c)) { await tx.contrato.update({ where: { id: c.id }, data: { situacao: "FINALIZADO", historico: { create: { descricao: "Contrato finalizado: chegou ao fim do período" } } } }); break; }
    if (!(agora && i === 0) && somarDias(c.proximoVencimento, -c.diasAntecedencia) > hoje) break;
    const venc = c.proximoVencimento;
    const ja = await tx.contratoCobranca.findUnique({ where: { contratoId_vencimento: { contratoId: c.id, vencimento: venc } } });
    if (!ja) {
      const cob = await tx.contratoCobranca.create({ data: { contratoId: c.id, numero: c.cobrancasGeradas + 1, vencimento: venc, referencia: referencia(venc, c.periodicidade as PeriodicidadeContrato) } });
      abertas.push(cob.id);
    }
    c = await tx.contrato.update({
      where: { id: c.id },
      data: { proximoVencimento: vencimentoSeguinte(venc, c.periodicidade as PeriodicidadeContrato, c.diaVencimento), cobrancasGeradas: { increment: ja ? 0 : 1 } },
    });
  }
  if (c.situacao === "ATIVO" && terminou(c)) await tx.contrato.update({ where: { id: c.id }, data: { situacao: "FINALIZADO", historico: { create: { descricao: "Contrato finalizado: última cobrança gerada" } } } });
  return abertas;
}

type Deps = { hoje?: Date; cliente?: ClienteInter; transporte?: Transporte; nfse?: DependenciasNfse };

/** Gera a venda de serviços de uma cobrança aberta (ou que deu erro). Pega a cobrança antes, para dois processos não gerarem duas vendas. */
/** Gera a venda da cobrança na loja (CNPJ) do contrato, mesmo quando roda pelo agendador ou por outra loja. */
export async function gerarVendaDaCobranca(cobrancaId: string, deps: Deps = {}) {
  const cob = await prisma.contratoCobranca.findUnique({ where: { id: cobrancaId }, select: { contrato: { select: { empresaId: true } } } });
  return naLoja(cob?.contrato.empresaId ?? null, () => gerarVendaNaLoja(cobrancaId, deps));
}

async function gerarVendaNaLoja(cobrancaId: string, deps: Deps) {
  const pega = await prisma.contratoCobranca.updateMany({ where: { id: cobrancaId, vendaId: null, situacao: { in: ["PENDENTE", "ERRO"] } }, data: { situacao: "GERANDO", erro: null } });
  if (!pega.count) return null;
  const cob = await prisma.contratoCobranca.findUniqueOrThrow({
    where: { id: cobrancaId },
    include: { contrato: { include: { servicos: { orderBy: { ordem: "asc" }, include: { servico: { select: { nome: true, codigo: true } } } } } } },
  });
  const c = cob.contrato;
  try {
    const situacao = await situacaoVendaContrato();
    const hoje = deps.hoje ?? diaSP();
    const obs = [`Contrato nº ${c.numero} · ${cob.referencia} · vencimento ${dataBr(cob.vencimento)}`, c.observacoes].filter(Boolean).join("\n");
    const pct = c.descontoPercentual != null;
    const dados: DadosOrcamento = {
      tipo: "SERVICO", numero: "", clienteId: c.clienteId, clienteNome: "", data: iso(hoje), validade: "", vendedorId: c.vendedorId ?? "", prazoEntrega: "", aosCuidados: "",
      canal: c.canal, centroCusto: c.centroCusto ?? "", introducao: "", situacaoId: situacao.id, produtos: [],
      servicos: c.servicos.map((s) => ({ servicoId: s.servicoId, nome: s.servico.nome, codigo: s.servico.codigo, detalhes: s.detalhes ?? "", quantidade: String(Number(s.quantidade)), valorUnit: Number(s.valorUnit).toFixed(2), desconto: Number(s.desconto).toFixed(2), descontoPct: false })),
      transportadoraId: "", transportadoraNome: "", frete: "0", mostrarEntrega: false, enderecoEntregaId: "",
      desconto: pct ? String(Number(c.descontoPercentual)) : Number(c.desconto).toFixed(2), descontoPct: pct, exibirTotal: true,
      gerarCondicoes: true, condicao: "AVISTA", formaPagamentoId: c.formaPagamentoId ?? "", vencimento: iso(cob.vencimento), intervaloDias: "30", numParcelas: "1", primeiraParcela: iso(cob.vencimento),
      parcelas: [], observacoes: obs, observacaoInterna: c.observacaoInterna ?? "", camposExtras: {},
    };
    const v = await salvarPedido(dados, { id: c.criadoPorId ?? "", nome: `Contrato nº ${c.numero}` }, undefined, { permitirNegativo: true });
    await prisma.$transaction([
      prisma.contratoCobranca.update({ where: { id: cob.id }, data: { vendaId: v.id, situacao: "GERADA", erro: null } }),
      prisma.vendaHistorico.create({ data: { vendaId: v.id, descricao: `Venda gerada pelo contrato nº ${c.numero} (${cob.referencia})`, situacao: situacao.nome } }),
      prisma.contratoHistorico.create({ data: { contratoId: c.id, descricao: `Cobrança ${cob.referencia} gerada: venda nº ${v.numero}, R$ ${brl(Number(v.total))}, vencimento ${dataBr(cob.vencimento)}` } }),
    ]);
    await boletosDoDocumento({ origemTipo: "VENDA", origemId: v.id }, { cliente: deps.cliente });
    return v;
  } catch (e) {
    await prisma.contratoCobranca.update({ where: { id: cob.id }, data: { situacao: "ERRO", erro: msg(e) } });
    throw e;
  }
}

/** NFS-e automática da venda gerada (uma tentativa; se recusar, fica o aviso e o botão na venda). */
async function notaDaCobranca(cobrancaId: string, deps: Deps) {
  const cob = await prisma.contratoCobranca.findUniqueOrThrow({ where: { id: cobrancaId } });
  if (!cob.vendaId || cob.notaTentadaEm) return;
  await prisma.contratoCobranca.update({ where: { id: cob.id }, data: { notaTentadaEm: new Date() } });
  try {
    const nota = await emitirNfseVenda(cob.vendaId, deps.nfse);
    const m = nota.status === "AUTORIZADA" ? `NFS-e nº ${nota.numero} autorizada` : `NFS-e nº ${nota.numero}: ${nota.motivo ?? nota.status}`;
    await prisma.contratoCobranca.update({ where: { id: cob.id }, data: { notaMsg: m.slice(0, 500) } });
    await prisma.vendaHistorico.create({ data: { vendaId: cob.vendaId, descricao: m.slice(0, 500) } });
  } catch (e) {
    await prisma.contratoCobranca.update({ where: { id: cob.id }, data: { notaMsg: `NFS-e não emitida: ${msg(e)}` } });
  }
}

// ───────────────────────── e-mails

/**
 * Manda o e-mail de cobrança (boleto) ou o lembrete. Espera o boleto ficar pronto quando a forma é boleto do Inter.
 * Devolve "ENVIADO", "AGUARDANDO" (boleto em processamento) ou lança o erro.
 */
export async function enviarEmailCobranca(cobrancaId: string, tipo: "BOLETO" | "LEMBRETE", deps: Deps = {}) {
  const cob = await prisma.contratoCobranca.findUniqueOrThrow({ where: { id: cobrancaId }, include: { contrato: { include: { cliente: true } } } });
  if (!cob.vendaId) throw new ContratoError("A cobrança ainda não gerou a venda");
  const c = cob.contrato;
  const lanc = await prisma.lancamento.findMany({ where: { origemTipo: "VENDA", origemId: cob.vendaId, tipo: "RECEBER" }, include: { formaPagamento: true, boletos: { orderBy: { createdAt: "desc" } } }, orderBy: { parcela: "asc" } });
  if (!lanc.length) throw new ContratoError("A venda gerada não tem contas a receber (confira a situação usada em Contratos → Configurações)");
  if (tipo === "LEMBRETE" && lanc.every((l) => l.pagoEm)) return "PAGO" as const;
  const l = lanc.find((x) => !x.pagoEm) ?? lanc[0];
  const boleto = l.boletos.find((b) => ATIVOS.includes(b.situacao));
  const ctx = l.formaPagamento?.boletoInter ? await contextoBoletos(deps.cliente) : null;
  if (ctx?.ajustes.emitirBoletos) {
    if (!boleto) {
      const erro = l.boletos.find((b) => b.situacao === "ERRO");
      if (erro) throw new ContratoError(`Boleto não emitido: ${erro.erro ?? "erro no Inter"}`);
      return "AGUARDANDO" as const;
    }
    if (!boleto.linhaDigitavel) return "AGUARDANDO" as const;
  }
  const para = c.emailCobranca ?? c.cliente.email;
  if (!para) throw new ContratoError(`O cliente ${c.cliente.nome} não tem e-mail: preencha no cadastro ou no campo "E-mail de cobrança" do contrato`);

  const cfg = await configContratos();
  const emp = await empresaDoDocumento(c.empresaId);
  const base = await baseLinks();
  const valores: Record<string, string> = {
    nome_cliente: c.cliente.nome, numero_contrato: String(c.numero), referencia: cob.referencia, valor: brl(Number(l.valor)), vencimento: dataBr(l.vencimento),
    linha_digitavel: boleto?.linhaDigitavel ?? "-", pix_copia_cola: boleto?.pixCopiaECola ?? "-",
    link_boleto: boleto && base ? `${base}/cobranca/boleto/${boleto.token}` : "-", nome_empresa: emp?.nomeFantasia || emp?.razaoSocial || "",
  };
  const anexos: { nome: string; conteudo: Buffer; tipo: string }[] = [];
  if (boleto?.codigoSolicitacao) {
    try { anexos.push({ nome: `boleto-${boleto.seuNumero}.pdf`, conteudo: await pdfBoleto(boleto.id, ctx ?? (await contextoBoletos(deps.cliente))), tipo: "application/pdf" }); } catch { /* vai sem o PDF; a linha digitável e o Pix estão no texto */ }
  }
  const assunto = preencher(tipo === "BOLETO" ? cfg.assuntoBoleto : cfg.assuntoLembrete, valores);
  const texto = preencher(tipo === "BOLETO" ? cfg.textoBoleto : cfg.textoLembrete, valores);
  await enviarEmail({ para, assunto, texto, anexos }, { transporte: deps.transporte });
  await prisma.$transaction([
    prisma.contratoCobranca.update({ where: { id: cob.id }, data: { [tipo === "BOLETO" ? "boletoEnviadoEm" : "lembreteEnviadoEm"]: new Date(), envioErro: null } }),
    prisma.contratoHistorico.create({ data: { contratoId: c.id, descricao: `${tipo === "BOLETO" ? "Cobrança" : "Lembrete de pagamento"} ${cob.referencia} enviado para ${para}` } }),
  ]);
  return "ENVIADO" as const;
}

// ───────────────────────── rotina

export type ResumoContratos = { abertas: number; vendas: number; notas: number; boletosEnviados: number; lembretes: number; erros: string[] };

export function textoResumo(r: ResumoContratos) {
  const partes = [
    r.vendas ? `${r.vendas} venda(s) gerada(s)` : "", r.boletosEnviados ? `${r.boletosEnviados} cobrança(s) enviada(s) por e-mail` : "",
    r.lembretes ? `${r.lembretes} lembrete(s) enviado(s)` : "", r.notas ? `${r.notas} NFS-e tentada(s)` : "",
  ].filter(Boolean);
  return `${partes.length ? partes.join(", ") : "Nada a fazer agora"}.${r.erros.length ? ` Atenção: ${r.erros[0]}${r.erros.length > 1 ? ` (+${r.erros.length - 1})` : ""}` : ""}`;
}

/** Tudo que os contratos precisam fazer hoje. Pode rodar várias vezes ao dia: só faz o que falta. */
export async function processarContratos(deps: Deps = {}): Promise<ResumoContratos> {
  const hoje = deps.hoje ?? diaSP();
  const r: ResumoContratos = { abertas: 0, vendas: 0, notas: 0, boletosEnviados: 0, lembretes: 0, erros: [] };
  const erro = (onde: string, e: unknown) => r.erros.push(`${onde}: ${msg(e)}`);

  // cobrança que ficou "gerando" (processo interrompido): não repete sozinha, para não duplicar a venda
  await prisma.contratoCobranca.updateMany({
    where: { situacao: "GERANDO", vendaId: null, updatedAt: { lt: new Date(Date.now() - 15 * 60000) } },
    data: { situacao: "ERRO", erro: "A geração foi interrompida: confira se a venda foi criada antes de tentar de novo" },
  });

  // 1) abre as cobranças que chegaram no prazo
  const ativos = await prisma.contrato.findMany({ where: { situacao: "ATIVO" }, select: { id: true, numero: true } });
  for (const c of ativos) {
    try { r.abertas += (await prisma.$transaction((tx) => abrirCobrancas(tx, c.id, hoje))).length; } catch (e) { erro(`Contrato ${c.numero}`, e); }
  }

  // 2) gera as vendas das cobranças abertas (tenta de novo as que deram erro uma vez por dia)
  const pendentes = await prisma.contratoCobranca.findMany({
    where: { vendaId: null, OR: [{ situacao: "PENDENTE" }, { situacao: "ERRO", updatedAt: { lt: new Date(Date.now() - 20 * 3600000) } }] },
    include: { contrato: { select: { numero: true } } }, orderBy: { vencimento: "asc" },
  });
  for (const p of pendentes) {
    try { if (await gerarVendaDaCobranca(p.id, deps)) r.vendas++; } catch (e) { erro(`Contrato ${p.contrato.numero} (${p.referencia})`, e); }
  }

  // 3) NFS-e automática
  const semNota = await prisma.contratoCobranca.findMany({ where: { vendaId: { not: null }, notaTentadaEm: null, contrato: { emitirNota: true } }, select: { id: true } });
  for (const s of semNota) { await notaDaCobranca(s.id, deps); r.notas++; }

  // 4) e-mails: cobrança (boleto) e lembrete, no dia certo, só para o que não foi pago
  const abertas = await prisma.contratoCobranca.findMany({
    where: { vendaId: { not: null }, vencimento: { gte: somarDias(hoje, -5) }, OR: [{ boletoEnviadoEm: null, contrato: { enviarBoleto: true } }, { lembreteEnviadoEm: null, contrato: { diasLembrete: { not: null } } }] },
    include: { contrato: { select: { numero: true, enviarBoleto: true, diasLembrete: true } } },
  });
  for (const a of abertas) {
    const onde = `Contrato ${a.contrato.numero} (${a.referencia})`;
    try {
      if (a.contrato.enviarBoleto && !a.boletoEnviadoEm) {
        const s = await enviarEmailCobranca(a.id, "BOLETO", deps);
        if (s === "ENVIADO") r.boletosEnviados++;
        if (s === "AGUARDANDO") continue; // o lembrete espera o boleto
      }
      const dl = a.contrato.diasLembrete;
      if (dl != null && !a.lembreteEnviadoEm && somarDias(a.vencimento, -dl) <= hoje && a.vencimento >= hoje) {
        // a cobrança que só saiu já dentro do prazo do lembrete basta: não manda os dois e-mails colados
        const recente = await prisma.contratoCobranca.findUniqueOrThrow({ where: { id: a.id }, select: { boletoEnviadoEm: true } });
        if (recente.boletoEnviadoEm && diaSP(recente.boletoEnviadoEm) >= somarDias(a.vencimento, -dl)) continue;
        if ((await enviarEmailCobranca(a.id, "LEMBRETE", deps)) === "ENVIADO") r.lembretes++;
      }
    } catch (e) {
      const m = msg(e);
      const antes = await prisma.contratoCobranca.findUnique({ where: { id: a.id }, select: { envioErro: true } });
      await prisma.contratoCobranca.update({ where: { id: a.id }, data: { envioErro: m } });
      if (antes?.envioErro !== m) erro(onde, e); // o mesmo erro não é repetido a cada hora
    }
  }
  return r;
}

/** Botão "Gerar cobrança agora": abre a próxima cobrança mesmo antes do prazo e processa. */
export async function gerarCobrancaAgora(contratoId: string, u: Usuario, deps: Deps = {}) {
  const c = await prisma.contrato.findUniqueOrThrow({ where: { id: contratoId } });
  if (c.situacao !== "ATIVO") throw new ContratoError("Só contratos ativos geram cobrança");
  const hoje = deps.hoje ?? diaSP();
  const abertas = await prisma.$transaction((tx) => abrirCobrancas(tx, contratoId, hoje, true));
  if (!abertas.length) throw new ContratoError("Nenhuma cobrança para gerar (o contrato chegou ao fim?)");
  await prisma.contratoHistorico.create({ data: { contratoId, descricao: "Cobrança gerada antes do prazo pelo botão \"Gerar cobrança agora\"", usuarioNome: u.nome } });
  return processarContratos({ ...deps, hoje });
}
