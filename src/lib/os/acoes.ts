"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { Prisma, type EstoqueSituacao, type NotaSituacao, type PapelUsuario } from "@prisma/client";
import { prisma } from "@/lib/db";
import { exigirUsuario } from "@/lib/auth/atual";
import { avisoBoletos, boletosDoDocumento } from "@/lib/financeiro/boletos";
import { emitirNfseOs, emitirNotaOs } from "@/lib/fiscal/emissao";
import { configOs } from "./config";
import { alterarSituacaoOrdem, clonarOrdem, excluirOrdem, salvarOrdem } from "./ordens";
import type { DadosOs } from "./tipos";

export type Resultado = { ok: boolean; mensagem: string } | null;
const ATENDE: PapelUsuario[] = ["ADMIN", "GERENTE", "OPERADOR", "TECNICO", "CAIXA"];
const GER: PapelUsuario[] = ["ADMIN", "GERENTE"];
const erro = (e: unknown) => ({ ok: false, mensagem: e instanceof Error ? e.message : String(e) });

export async function salvarOsForm(_: Resultado, form: FormData): Promise<Resultado> {
  const u = await exigirUsuario(ATENDE);
  let destino: string;
  try {
    const d = JSON.parse(String(form.get("dados"))) as DadosOs & { id?: string };
    const o = await salvarOrdem(d, u, d.id, { permitirNegativo: (await configOs()).estoqueNegativo });
    await boletosDoDocumento({ origemTipo: "OS", origemId: o.id });
    const anexos = form.getAll("anexos").filter((a): a is File => a instanceof File && a.size > 0);
    for (const a of anexos) {
      if (a.size > 5 * 1024 * 1024) throw new Error(`O anexo ${a.name} passa de 5 MB`);
      await prisma.anexo.create({ data: { entidade: "OS", entidadeId: o.id, nome: a.name, tipo: a.type || "application/octet-stream", tamanho: a.size, dados: Buffer.from(await a.arrayBuffer()), usuarioId: u.id } });
    }
    revalidatePath("/os");
    destino = `/os/${o.id}`;
  } catch (e) { return erro(e); }
  redirect(destino);
}

export async function alterarSituacaoOsAcao(_: Resultado, form: FormData): Promise<Resultado> {
  const u = await exigirUsuario(ATENDE);
  try {
    const r = await alterarSituacaoOrdem(String(form.get("id")), String(form.get("situacaoId")), u, { observacao: String(form.get("observacao") ?? ""), forcar: form.get("forcar") === "1", permitirNegativo: (await configOs()).estoqueNegativo });
    const bol = avisoBoletos(await boletosDoDocumento({ origemTipo: "OS", origemId: String(form.get("id")) }));
    revalidatePath("/os", "layout");
    return { ok: true, mensagem: `Situação alterada para ${r.para.nome}.${bol ? ` ${bol}` : ""}` };
  } catch (e) { return erro(e); }
}

export async function situacaoOsEmMassaAcao(_: Resultado, form: FormData): Promise<Resultado> {
  const u = await exigirUsuario(ATENDE);
  const ids = form.getAll("ids").map(String);
  if (!ids.length) return { ok: false, mensagem: "Marque as OS na lista" };
  const sit = String(form.get("situacaoId") ?? "");
  if (!sit) return { ok: false, mensagem: "Escolha a situação" };
  let ok = 0; const falhas: string[] = [];
  for (const id of ids) { try { await alterarSituacaoOrdem(id, sit, u, { permitirNegativo: true }); await boletosDoDocumento({ origemTipo: "OS", origemId: id }); ok++; } catch (e) { falhas.push(e instanceof Error ? e.message : String(e)); } }
  revalidatePath("/os", "layout");
  return { ok: true, mensagem: `${ok} OS alterada(s).${falhas.length ? ` ${falhas.length} não puderam: ${falhas[0]}` : ""}` };
}

export async function clonarOsAcao(id: string) {
  const u = await exigirUsuario(ATENDE);
  let destino: string;
  try { const c = await clonarOrdem(id, u); destino = `/os/${c.id}/editar`; } catch (e) { return erro(e); }
  redirect(destino);
}

export async function excluirOsAcao(id: string) {
  await exigirUsuario(GER);
  try { const n = await excluirOrdem(id); await boletosDoDocumento({ lancamentoIds: [] }); revalidatePath("/os", "layout"); return { ok: true, mensagem: `OS nº ${n} excluída.` }; } catch (e) { return erro(e); }
}

export async function excluirOsEVoltarAcao(id: string) {
  const r = await excluirOsAcao(id);
  if (!r.ok) return r;
  redirect("/os");
}

export async function excluirVariasOsAcao(_: Resultado, form: FormData): Promise<Resultado> {
  await exigirUsuario(GER);
  const ids = form.getAll("ids").map(String);
  if (!ids.length) return { ok: false, mensagem: "Marque as OS na lista" };
  let ok = 0; const falhas: string[] = [];
  for (const id of ids) { try { await excluirOrdem(id); ok++; } catch (e) { falhas.push(e instanceof Error ? e.message : String(e)); } }
  await boletosDoDocumento({ lancamentoIds: [] });
  revalidatePath("/os", "layout");
  return { ok: true, mensagem: `${ok} OS excluída(s).${falhas.length ? ` ${falhas.length} não puderam: ${falhas[0]}` : ""}` };
}

/** Editar ▾ › Emitir NF-e (peças) / NFS-e (serviços). */
export async function emitirNotaOsAcao(id: string, tipo: "NFE" | "NFSE") {
  const u = await exigirUsuario(GER);
  try {
    const n = tipo === "NFE" ? await emitirNotaOs(id) : await emitirNfseOs(id);
    await prisma.osHistorico.create({ data: { osId: id, usuarioId: u.id, usuarioNome: u.nome, descricao: `${tipo === "NFE" ? "NF-e" : "NFS-e"} nº ${n.numero}: ${n.status === "AUTORIZADA" ? "autorizada" : `${n.status.toLowerCase()}${n.motivo ? ` (${n.motivo})` : ""}`}` } });
    revalidatePath(`/os/${id}`);
    return { ok: n.status === "AUTORIZADA", mensagem: n.status === "AUTORIZADA" ? `Nota nº ${n.numero} autorizada.` : `Nota nº ${n.numero}: ${n.motivo ?? n.status}` };
  } catch (e) { return erro(e); }
}

/** Mais ações › Gerar NFS-e: emite a NFS-e das OS marcadas. */
export async function nfseEmMassaAcao(_: Resultado, form: FormData): Promise<Resultado> {
  await exigirUsuario(GER);
  const ids = form.getAll("ids").map(String);
  if (!ids.length) return { ok: false, mensagem: "Marque as OS na lista" };
  let ok = 0; const falhas: string[] = [];
  for (const id of ids) { const r = await emitirNotaOsAcao(id, "NFSE"); if (r.ok) ok++; else falhas.push(r.mensagem); }
  return { ok: !falhas.length, mensagem: `${ok} NFS-e autorizada(s).${falhas.length ? ` ${falhas.length} com problema: ${falhas[0]}` : ""}` };
}

export async function anotarOsAcao(_: Resultado, form: FormData): Promise<Resultado> {
  const u = await exigirUsuario();
  const texto = String(form.get("texto") ?? "").trim();
  if (!texto) return { ok: false, mensagem: "Escreva a anotação" };
  await prisma.anotacao.create({ data: { entidade: "OS", entidadeId: String(form.get("entidadeId")), texto, usuarioId: u.id } });
  revalidatePath(String(form.get("caminho") || "/os"));
  return { ok: true, mensagem: "Anotação registrada" };
}

/** Lista ⇄ Kanban: a escolha fica salva por usuário. */
export async function visualizacaoOsAcao(modo: "lista" | "kanban") {
  const u = await exigirUsuario();
  const chave = `os-visualizacao:${u.id}`;
  await prisma.configuracao.upsert({ where: { chave }, create: { chave, valor: modo }, update: { valor: modo } });
  revalidatePath("/os");
}

/** Lista de separação: marca a peça como pega na prateleira. */
export async function marcarSeparadoAcao(form: FormData) {
  await exigirUsuario(ATENDE);
  const osId = String(form.get("osId"));
  await prisma.reserva.update({ where: { id: String(form.get("reservaId")) }, data: { separado: form.get("separado") === "1" } });
  revalidatePath(`/os/${osId}/separacao`);
  revalidatePath(`/os/${osId}`);
}

// ---------- opções auxiliares

export async function salvarSituacaoOsAcao(_: Resultado, form: FormData): Promise<Resultado> {
  await exigirUsuario(GER);
  const id = String(form.get("id") || "");
  const nome = String(form.get("nome") ?? "").trim();
  if (!nome) return { ok: false, mensagem: "Informe o nome" };
  const um = <T extends string>(k: string, ok: readonly T[], padrao: T) => (ok.includes(String(form.get(k)) as T) ? (String(form.get(k)) as T) : padrao);
  const dados = {
    nome, cor: String(form.get("cor") || "cinza"), padrao: form.get("padrao") === "1", permiteEdicao: form.get("permiteEdicao") !== "0",
    exibir: form.get("exibir") !== "0", exibirCobranca: form.get("exibirCobranca") !== "0",
    estoque: um<EstoqueSituacao>("estoque", ["RESERVAR", "LANCAR", "NAO"], "RESERVAR"), financeiro: form.get("financeiro") === "1",
    notaServico: um<NotaSituacao>("notaServico", ["NAO", "GERAR", "EMITIR"], "NAO"),
    enviarMensagem: form.get("enviarMensagem") === "1", modeloMensagemId: String(form.get("modeloMensagemId") || "") || null,
    gerarAssinatura: form.get("gerarAssinatura") === "1", preencherSaida: form.get("preencherSaida") === "1",
    bloqueados: form.getAll("bloqueados").map(String) as PapelUsuario[],
  };
  if (dados.financeiro && dados.estoque !== "LANCAR") return { ok: false, mensagem: "Para lançar o financeiro, a situação também precisa lançar o estoque" };
  try {
    if (id) {
      const usada = await prisma.ordemServico.count({ where: { situacaoId: id } });
      const antes = await prisma.situacaoOsConfig.findUniqueOrThrow({ where: { id } });
      if (usada && (antes.estoque !== dados.estoque || antes.financeiro !== dados.financeiro))
        return { ok: false, mensagem: `${usada} OS estão nesta situação: para mudar o estoque ou o financeiro, crie uma situação nova e mova as OS.` };
    }
    await prisma.$transaction(async (tx) => {
      if (dados.padrao) await tx.situacaoOsConfig.updateMany({ data: { padrao: false } });
      if (id) await tx.situacaoOsConfig.update({ where: { id }, data: dados });
      else await tx.situacaoOsConfig.create({ data: { ...dados, ordem: await tx.situacaoOsConfig.count() } });
    });
  } catch (e) {
    return e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002" ? { ok: false, mensagem: "Já existe uma situação com esse nome" } : erro(e);
  }
  revalidatePath("/os/situacoes");
  redirect("/os/situacoes");
}

export async function moverSituacaoOsAcao(id: string, direcao: -1 | 1) {
  await exigirUsuario(GER);
  const l = await prisma.situacaoOsConfig.findMany({ orderBy: [{ ordem: "asc" }, { nome: "asc" }] });
  const i = l.findIndex((x) => x.id === id), j = i + direcao;
  if (i < 0 || j < 0 || j >= l.length) return;
  [l[i], l[j]] = [l[j], l[i]];
  await prisma.$transaction(l.map((x, k) => prisma.situacaoOsConfig.update({ where: { id: x.id }, data: { ordem: k } })));
  revalidatePath("/os/situacoes");
}

export async function excluirSituacaoOsAcao(id: string) {
  await exigirUsuario(GER);
  const n = await prisma.ordemServico.count({ where: { situacaoId: id } });
  if (n) return { ok: false, mensagem: `${n} OS estão nesta situação. Mude a situação delas antes.` };
  const s = await prisma.situacaoOsConfig.findUniqueOrThrow({ where: { id } });
  if (s.padrao) return { ok: false, mensagem: "Escolha outra situação padrão antes de excluir esta" };
  await prisma.situacaoOsConfig.delete({ where: { id } });
  revalidatePath("/os/situacoes");
  return { ok: true, mensagem: "Situação excluída" };
}

export async function salvarMensagemOsAcao(_: Resultado, form: FormData): Promise<Resultado> {
  await exigirUsuario(GER);
  const id = String(form.get("id") || "");
  const assunto = String(form.get("assunto") ?? "").trim();
  const email = String(form.get("email") ?? "").trim();
  const sms = String(form.get("sms") ?? "").trim();
  const padrao = form.get("padrao") === "1";
  if (!assunto) return { ok: false, mensagem: "Informe o assunto" };
  if (assunto.length > 80) return { ok: false, mensagem: "O assunto tem no máximo 80 caracteres" };
  if (!email) return { ok: false, mensagem: "Escreva a mensagem do e-mail" };
  if (sms.length > 120) return { ok: false, mensagem: "A mensagem de SMS tem no máximo 120 caracteres" };
  await prisma.$transaction(async (tx) => {
    if (padrao) await tx.modeloMensagem.updateMany({ where: { tipo: "OS" }, data: { padrao: false } });
    const dados = { tipo: "OS", assunto, email, sms: sms || null, padrao };
    if (id) await tx.modeloMensagem.update({ where: { id }, data: dados });
    else await tx.modeloMensagem.create({ data: dados });
  });
  revalidatePath("/os/mensagens");
  redirect("/os/mensagens");
}

export async function excluirMensagemOsAcao(id: string) {
  await exigirUsuario(GER);
  await prisma.modeloMensagem.delete({ where: { id } });
  revalidatePath("/os/mensagens");
  return { ok: true, mensagem: "Mensagem excluída" };
}

export async function salvarConfigOsAcao(_: Resultado, form: FormData): Promise<Resultado> {
  await exigirUsuario(GER);
  const ultimo = Math.trunc(Number(form.get("ultimoNumero")));
  if (!(ultimo >= 0)) return { ok: false, mensagem: "Último número inválido" };
  const maior = (await prisma.ordemServico.aggregate({ _max: { numero: true } }))._max.numero ?? 0;
  if (ultimo < maior) return { ok: false, mensagem: `Já existe a OS nº ${maior}; o último número não pode ser menor.` };
  const docs = ["numeroItem", "codigoProduto", "unidade", "imagemProduto", "descricaoProduto", "ncm", "valorUnitario", "subtotal", "descricaoServico", "imagemServico", "atividades", "anexos", "imagemAnexo"];
  const valor = {
    observacoes: String(form.get("observacoes") ?? ""), garantia: String(form.get("garantia") ?? ""),
    estoqueNegativo: form.get("estoqueNegativo") === "1", semCondicao: form.get("semCondicao") === "1",
    documentos: Object.fromEntries(docs.map((k) => [k, form.get(k) === "1"])),
  };
  await prisma.$transaction([
    prisma.sequencia.upsert({ where: { chave: "OS" }, create: { chave: "OS", valor: ultimo }, update: { valor: ultimo } }),
    prisma.configuracao.upsert({ where: { chave: "os" }, create: { chave: "os", valor }, update: { valor } }),
  ]);
  revalidatePath("/os", "layout");
  return { ok: true, mensagem: "Configurações salvas." };
}
