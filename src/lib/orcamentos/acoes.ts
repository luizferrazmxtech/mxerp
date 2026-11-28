"use server";

import { chaveDoc } from "@/lib/sequencia";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { Prisma, type PapelUsuario } from "@prisma/client";
import { prisma } from "@/lib/db";
import { exigirAcao, exigirUsuario } from "@/lib/auth/atual";
import {
  alterarSituacaoOrcamento, clonarOrcamento, excluirOrcamento, gerarOsDoOrcamento, gerarVendaDoOrcamento, salvarOrcamento, type DadosOrcamento,
} from "./orcamentos";

export type Resultado = { ok: boolean; mensagem: string; sugerirVenda?: boolean } | null;
const EDITA: PapelUsuario[] = ["ADMIN", "GERENTE", "OPERADOR", "TECNICO", "CAIXA"];
const GER: PapelUsuario[] = ["ADMIN", "GERENTE"];
const erro = (e: unknown) => ({ ok: false, mensagem: e instanceof Error ? e.message : String(e) });
const base = (_tipo?: string) => "/orcamentos";

export async function salvarOrcamentoForm(_: Resultado, form: FormData): Promise<Resultado> {
  const u = await exigirUsuario(EDITA);
  let destino: string;
  try {
    const d = JSON.parse(String(form.get("dados"))) as DadosOrcamento & { id?: string };
    const o = await salvarOrcamento(d, u, d.id);
    const anexos = form.getAll("anexos").filter((a): a is File => a instanceof File && a.size > 0);
    for (const a of anexos) {
      if (a.size > 5 * 1024 * 1024) throw new Error(`O anexo ${a.name} passa de 5 MB`);
      await prisma.anexo.create({ data: { entidade: "ORCAMENTO", entidadeId: o.id, nome: a.name, tipo: a.type || "application/octet-stream", tamanho: a.size, dados: Buffer.from(await a.arrayBuffer()), usuarioId: u.id } });
    }
    revalidatePath(base(o.tipo));
    destino = `/orcamentos/${o.id}`;
  } catch (e) { return erro(e); }
  redirect(destino);
}

const VENDE: PapelUsuario[] = ["ADMIN", "GERENTE", "OPERADOR", "CAIXA"];

/**
 * Alterar situação. Na situação de concretizado o valor vem como "id|venda" ou "id|os":
 * troca a situação e já gera a venda/OS com o conteúdo do orçamento (abre a venda/OS gerada).
 */
export async function alterarSituacaoAcao(_: Resultado, form: FormData): Promise<Resultado> {
  const u = await exigirUsuario(EDITA);
  const [situacaoId, gerar] = String(form.get("situacaoId") ?? "").split("|");
  const id = String(form.get("id"));
  const observacao = String(form.get("observacao") ?? "").trim();
  if (gerar === "venda" || gerar === "os") {
    let destino: string;
    try {
      if (gerar === "venda" && u.papel && !VENDE.includes(u.papel)) throw new Error("Seu grupo não pode gerar venda");
      const atual = await prisma.orcamento.findUniqueOrThrow({ where: { id }, include: { situacao: true } });
      if (u.papel && atual.situacao.bloqueados.includes(u.papel)) throw new Error(`Seu grupo não pode trocar a situação "${atual.situacao.nome}"`);
      destino = gerar === "venda" ? `/vendas/${(await gerarVendaDoOrcamento(id, u, situacaoId)).vendaId}` : `/os/${(await gerarOsDoOrcamento(id, u, situacaoId)).osId}`;
      if (observacao) await prisma.orcamentoHistorico.create({ data: { orcamentoId: id, descricao: observacao, usuarioNome: u.nome } });
    } catch (e) { return erro(e); }
    revalidatePath("/orcamentos", "layout");
    redirect(destino);
  }
  try {
    const r = await alterarSituacaoOrcamento(id, situacaoId, u, observacao);
    revalidatePath("/orcamentos", "layout");
    return { ok: true, mensagem: `Situação alterada para ${r.situacao.nome}.`, sugerirVenda: r.sugerirVenda };
  } catch (e) { return erro(e); }
}

/** Mais ações › alterar a situação de vários marcados. */
export async function situacaoEmMassaAcao(_: Resultado, form: FormData): Promise<Resultado> {
  const u = await exigirUsuario(EDITA);
  const ids = form.getAll("ids").map(String);
  if (!ids.length) return { ok: false, mensagem: "Marque os orçamentos na lista" };
  const sit = String(form.get("situacaoId") ?? "");
  if (!sit) return { ok: false, mensagem: "Escolha a situação" };
  let ok = 0; const falhas: string[] = [];
  for (const id of ids) { try { await alterarSituacaoOrcamento(id, sit, u); ok++; } catch (e) { falhas.push(e instanceof Error ? e.message : String(e)); } }
  revalidatePath("/orcamentos", "layout");
  return { ok: true, mensagem: `${ok} orçamento(s) alterado(s).${falhas.length ? ` ${falhas.length} não puderam: ${falhas[0]}` : ""}` };
}

export async function clonarOrcamentoAcao(id: string) {
  const u = await exigirUsuario(EDITA);
  const c = await clonarOrcamento(id, u);
  redirect(`/orcamentos/${c.id}/editar`);
}

export async function excluirOrcamentoAcao(id: string) {
  await exigirAcao("orcamento.excluir");
  try { const r = await excluirOrcamento(id); revalidatePath("/orcamentos", "layout"); return r; } catch (e) { return erro(e); }
}

export async function excluirOrcamentosAcao(_: Resultado, form: FormData): Promise<Resultado> {
  await exigirAcao("orcamento.excluir");
  const ids = form.getAll("ids").map(String);
  if (!ids.length) return { ok: false, mensagem: "Marque os orçamentos na lista" };
  for (const id of ids) await excluirOrcamento(id);
  revalidatePath("/orcamentos", "layout");
  return { ok: true, mensagem: `${ids.length} orçamento(s) excluído(s).` };
}

export async function gerarVendaAcao(id: string) {
  const u = await exigirUsuario(VENDE);
  let destino: string;
  try { const r = await gerarVendaDoOrcamento(id, u); destino = `/vendas/${r.vendaId}`; } catch (e) { return erro(e); }
  revalidatePath("/orcamentos", "layout");
  redirect(destino);
}

export async function gerarOsAcao(id: string) {
  const u = await exigirUsuario(EDITA);
  let destino: string;
  try { const r = await gerarOsDoOrcamento(id, u); destino = `/os/${r.osId}`; } catch (e) { return erro(e); }
  revalidatePath("/orcamentos", "layout");
  redirect(destino);
}

export async function anotarOrcamentoAcao(_: Resultado, form: FormData): Promise<Resultado> {
  const u = await exigirUsuario();
  const texto = String(form.get("texto") ?? "").trim();
  if (!texto) return { ok: false, mensagem: "Escreva a anotação" };
  await prisma.anotacao.create({ data: { entidade: "ORCAMENTO", entidadeId: String(form.get("entidadeId")), texto, usuarioId: u.id } });
  revalidatePath(String(form.get("caminho") || "/orcamentos"));
  return { ok: true, mensagem: "Anotação registrada" };
}

export async function excluirAnotacaoAcao(id: string) {
  await exigirUsuario();
  await prisma.anotacao.delete({ where: { id } });
  return { ok: true, mensagem: "Anotação excluída" };
}

// ---------- opções auxiliares

export async function salvarSituacaoAcao(_: Resultado, form: FormData): Promise<Resultado> {
  await exigirUsuario(GER);
  const id = String(form.get("id") || "");
  const nome = String(form.get("nome") ?? "").trim();
  if (!nome) return { ok: false, mensagem: "Informe o nome" };
  const dados = {
    nome, cor: String(form.get("cor") || "cinza"), exibir: form.get("exibir") !== "0", geraVenda: form.get("geraVenda") === "1",
    enviarMensagem: form.get("enviarMensagem") === "1", modeloMensagemId: String(form.get("modeloMensagemId") || "") || null,
    gerarAssinatura: form.get("gerarAssinatura") === "1", bloqueados: form.getAll("bloqueados").map(String) as PapelUsuario[],
  };
  try {
    if (id) await prisma.situacaoOrcamento.update({ where: { id }, data: dados });
    else await prisma.situacaoOrcamento.create({ data: { ...dados, ordem: await prisma.situacaoOrcamento.count() } });
  } catch (e) {
    return e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002" ? { ok: false, mensagem: "Já existe uma situação com esse nome" } : erro(e);
  }
  revalidatePath("/orcamentos/situacoes");
  redirect("/orcamentos/situacoes");
}

export async function moverSituacaoAcao(id: string, direcao: -1 | 1) {
  await exigirUsuario(GER);
  const l = await prisma.situacaoOrcamento.findMany({ orderBy: [{ ordem: "asc" }, { nome: "asc" }] });
  const i = l.findIndex((x) => x.id === id), j = i + direcao;
  if (i < 0 || j < 0 || j >= l.length) return;
  [l[i], l[j]] = [l[j], l[i]];
  await prisma.$transaction(l.map((x, k) => prisma.situacaoOrcamento.update({ where: { id: x.id }, data: { ordem: k } })));
  revalidatePath("/orcamentos/situacoes");
}

export async function excluirSituacaoAcao(id: string) {
  await exigirUsuario(GER);
  const n = await prisma.orcamento.count({ where: { situacaoId: id } });
  if (n) return { ok: false, mensagem: `${n} orçamento(s) estão nesta situação. Mude a situação deles antes.` };
  if ((await prisma.situacaoOrcamento.count()) <= 1) return { ok: false, mensagem: "Deixe ao menos uma situação" };
  await prisma.situacaoOrcamento.delete({ where: { id } });
  revalidatePath("/orcamentos/situacoes");
  return { ok: true, mensagem: "Situação excluída" };
}

export async function salvarMensagemAcao(_: Resultado, form: FormData): Promise<Resultado> {
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
    if (padrao) await tx.modeloMensagem.updateMany({ where: { tipo: "OR" }, data: { padrao: false } });
    const dados = { tipo: "OR", assunto, email, sms: sms || null, padrao };
    if (id) await tx.modeloMensagem.update({ where: { id }, data: dados });
    else await tx.modeloMensagem.create({ data: dados });
  });
  revalidatePath("/orcamentos/mensagens");
  redirect("/orcamentos/mensagens");
}

export async function excluirMensagemAcao(id: string) {
  await exigirUsuario(GER);
  await prisma.modeloMensagem.delete({ where: { id } });
  revalidatePath("/orcamentos/mensagens");
  return { ok: true, mensagem: "Mensagem excluída" };
}

export async function salvarConfigOrcamentoAcao(_: Resultado, form: FormData): Promise<Resultado> {
  await exigirUsuario(GER);
  const ultimo = Math.trunc(Number(form.get("ultimoNumero")));
  if (!(ultimo >= 0)) return { ok: false, mensagem: "Último número inválido" };
  const maior = (await prisma.orcamento.aggregate({ _max: { numero: true } }))._max.numero ?? 0;
  if (ultimo < maior) return { ok: false, mensagem: `Já existe o orçamento nº ${maior}; o último número não pode ser menor.` };
  const docs = ["numeroItem", "codigoProduto", "unidade", "imagemProduto", "descricaoProduto", "ncm", "valorUnitario", "subtotal", "descricaoServico", "imagemServico", "anexos", "imagemAnexo"];
  const valor = {
    introducao: String(form.get("introducao") ?? ""), observacoes: String(form.get("observacoes") ?? ""),
    formatoA4: String(form.get("formatoA4") || "PDF"), fonteA4: Number(form.get("fonteA4")) || 11, fonteCupom: Number(form.get("fonteCupom")) || 9,
    documentos: Object.fromEntries(docs.map((k) => [k, form.get(k) === "1"])),
  };
  await prisma.$transaction([
    prisma.sequencia.upsert({ where: { chave: await chaveDoc("ORCAMENTO") }, create: { chave: await chaveDoc("ORCAMENTO"), valor: ultimo }, update: { valor: ultimo } }),
    prisma.configuracao.upsert({ where: { chave: "orcamento" }, create: { chave: "orcamento", valor }, update: { valor } }),
  ]);
  revalidatePath("/orcamentos", "layout");
  return { ok: true, mensagem: "Configurações salvas." };
}
