"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { Prisma, type EstoqueSituacao, type NotaSituacao, type PapelUsuario } from "@prisma/client";
import { prisma } from "@/lib/db";
import { exigirAcao, exigirUsuario } from "@/lib/auth/atual";
import { avisoBoletos, boletosDoDocumento } from "@/lib/financeiro/boletos";
import { emitirNfseVenda, emitirNotaVenda } from "@/lib/fiscal/emissao";
import { configVenda } from "./config";
import { alterarSituacaoPedido, clonarPedido, excluirPedido, registrarDevolucao, salvarPedido, type DadosPedido } from "./pedidos";

export type Resultado = { ok: boolean; mensagem: string } | null;
const VENDE: PapelUsuario[] = ["ADMIN", "GERENTE", "OPERADOR", "CAIXA"];
const GER: PapelUsuario[] = ["ADMIN", "GERENTE"];
const erro = (e: unknown) => ({ ok: false, mensagem: e instanceof Error ? e.message : String(e) });
const base = (tipo: string) => (tipo === "BALCAO" ? "/vendas/balcao" : "/vendas");

export async function salvarPedidoForm(_: Resultado, form: FormData): Promise<Resultado> {
  const u = await exigirUsuario(VENDE);
  let destino: string;
  try {
    const d = JSON.parse(String(form.get("dados"))) as DadosPedido & { id?: string };
    const v = await salvarPedido(d, u, d.id, { permitirNegativo: (await configVenda()).estoqueNegativo });
    await boletosDoDocumento({ origemTipo: "VENDA", origemId: v.id });
    const anexos = form.getAll("anexos").filter((a): a is File => a instanceof File && a.size > 0);
    for (const a of anexos) {
      if (a.size > 5 * 1024 * 1024) throw new Error(`O anexo ${a.name} passa de 5 MB`);
      await prisma.anexo.create({ data: { entidade: "VENDA", entidadeId: v.id, nome: a.name, tipo: a.type || "application/octet-stream", tamanho: a.size, dados: Buffer.from(await a.arrayBuffer()), usuarioId: u.id } });
    }
    revalidatePath(base(v.tipo));
    destino = `/vendas/${v.id}`;
  } catch (e) { return erro(e); }
  redirect(destino);
}

export async function alterarSituacaoVendaAcao(_: Resultado, form: FormData): Promise<Resultado> {
  const u = await exigirAcao("venda.situacao");
  try {
    const r = await alterarSituacaoPedido(String(form.get("id")), String(form.get("situacaoId")), u, { observacao: String(form.get("observacao") ?? ""), forcar: form.get("forcar") === "1", permitirNegativo: (await configVenda()).estoqueNegativo });
    const bol = avisoBoletos(await boletosDoDocumento({ origemTipo: "VENDA", origemId: String(form.get("id")) }));
    revalidatePath("/vendas", "layout");
    return { ok: true, mensagem: `Situação alterada para ${r.para.nome}.${bol ? ` ${bol}` : ""}` };
  } catch (e) { return erro(e); }
}

export async function situacaoVendasEmMassaAcao(_: Resultado, form: FormData): Promise<Resultado> {
  const u = await exigirAcao("venda.situacao");
  const ids = form.getAll("ids").map(String);
  if (!ids.length) return { ok: false, mensagem: "Marque as vendas na lista" };
  const sit = String(form.get("situacaoId") ?? "");
  if (!sit) return { ok: false, mensagem: "Escolha a situação" };
  let ok = 0; const falhas: string[] = [];
  for (const id of ids) { try { await alterarSituacaoPedido(id, sit, u, { permitirNegativo: true }); await boletosDoDocumento({ origemTipo: "VENDA", origemId: id }); ok++; } catch (e) { falhas.push(e instanceof Error ? e.message : String(e)); } }
  revalidatePath("/vendas", "layout");
  return { ok: true, mensagem: `${ok} venda(s) alterada(s).${falhas.length ? ` ${falhas.length} não puderam: ${falhas[0]}` : ""}` };
}

export async function clonarVendaAcao(id: string) {
  const u = await exigirUsuario(VENDE);
  let destino: string;
  try { const c = await clonarPedido(id, u); destino = `/vendas/${c.id}/editar`; } catch (e) { return erro(e); }
  redirect(destino);
}

export async function excluirVendaAcao(id: string) {
  await exigirAcao("venda.excluir");
  try { const n = await excluirPedido(id); await boletosDoDocumento({ lancamentoIds: [] }); revalidatePath("/vendas", "layout"); return { ok: true, mensagem: `Venda nº ${n} excluída.` }; } catch (e) { return erro(e); }
}

export async function excluirVendaEVoltarAcao(id: string, voltar: string) {
  const r = await excluirVendaAcao(id);
  if (!r.ok) return r;
  redirect(voltar.startsWith("/") && !voltar.startsWith("//") ? voltar : "/vendas"); // só volta para dentro do sistema
}

export async function excluirVendasAcao(_: Resultado, form: FormData): Promise<Resultado> {
  await exigirAcao("venda.excluir");
  const ids = form.getAll("ids").map(String);
  if (!ids.length) return { ok: false, mensagem: "Marque as vendas na lista" };
  let ok = 0; const falhas: string[] = [];
  for (const id of ids) { try { await excluirPedido(id); ok++; } catch (e) { falhas.push(e instanceof Error ? e.message : String(e)); } }
  await boletosDoDocumento({ lancamentoIds: [] });
  revalidatePath("/vendas", "layout");
  return { ok: true, mensagem: `${ok} venda(s) excluída(s).${falhas.length ? ` ${falhas.length} não puderam: ${falhas[0]}` : ""}` };
}

/** Editar ▾ › Emitir NF-e / NFS-e. */
export async function emitirNotaVendaAcao(id: string, tipo: "NFE" | "NFSE") {
  await exigirUsuario(GER);
  try {
    const n = tipo === "NFE" ? await emitirNotaVenda(id, 55) : await emitirNfseVenda(id);
    await prisma.vendaHistorico.create({ data: { vendaId: id, descricao: `${tipo === "NFE" ? "NF-e" : "NFS-e"} nº ${n.numero}: ${n.status === "AUTORIZADA" ? "autorizada" : `${n.status.toLowerCase()}${n.motivo ? ` (${n.motivo})` : ""}`}` } });
    revalidatePath(`/vendas/${id}`);
    return { ok: n.status === "AUTORIZADA", mensagem: n.status === "AUTORIZADA" ? `Nota nº ${n.numero} autorizada.` : `Nota nº ${n.numero}: ${n.motivo ?? n.status}` };
  } catch (e) { return erro(e); }
}

export async function anotarVendaAcao(_: Resultado, form: FormData): Promise<Resultado> {
  const u = await exigirUsuario();
  const texto = String(form.get("texto") ?? "").trim();
  if (!texto) return { ok: false, mensagem: "Escreva a anotação" };
  await prisma.anotacao.create({ data: { entidade: "VENDA", entidadeId: String(form.get("entidadeId")), texto, usuarioId: u.id } });
  revalidatePath(String(form.get("caminho") || "/vendas"));
  return { ok: true, mensagem: "Anotação registrada" };
}

// ---------- trocas e devoluções

export async function devolucaoAcao(_: Resultado, form: FormData): Promise<Resultado> {
  const u = await exigirAcao("venda.devolucao");
  let destino: string;
  try {
    const itens = JSON.parse(String(form.get("itens") ?? "[]")) as { vendaItemId: string; quantidade: number }[];
    const d = await registrarDevolucao({ vendaId: String(form.get("vendaId")), tipo: form.get("tipo") === "TROCA" ? "TROCA" : "DEVOLUCAO", itens, observacao: String(form.get("observacao") ?? "") }, u);
    revalidatePath("/vendas/devolucoes");
    destino = `/vendas/devolucoes?periodo=todos&ok=${d.numero}`;
  } catch (e) { return erro(e); }
  redirect(destino);
}

// ---------- opções auxiliares

export async function salvarSituacaoVendaAcao(_: Resultado, form: FormData): Promise<Resultado> {
  await exigirUsuario(GER);
  const id = String(form.get("id") || "");
  const nome = String(form.get("nome") ?? "").trim();
  if (!nome) return { ok: false, mensagem: "Informe o nome" };
  const um = <T extends string>(k: string, ok: readonly T[], padrao: T) => (ok.includes(String(form.get(k)) as T) ? (String(form.get(k)) as T) : padrao);
  const dados = {
    nome, cor: String(form.get("cor") || "cinza"), padrao: form.get("padrao") === "1", permiteEdicao: form.get("permiteEdicao") !== "0",
    exibir: form.get("exibir") !== "0", exibirCobranca: form.get("exibirCobranca") !== "0",
    estoque: um<EstoqueSituacao>("estoque", ["RESERVAR", "LANCAR", "NAO"], "RESERVAR"), financeiro: form.get("financeiro") === "1",
    notaProduto: um<NotaSituacao>("notaProduto", ["NAO", "GERAR", "EMITIR"], "NAO"), notaServico: um<NotaSituacao>("notaServico", ["NAO", "GERAR", "EMITIR"], "NAO"),
    enviarMensagem: form.get("enviarMensagem") === "1", modeloMensagemId: String(form.get("modeloMensagemId") || "") || null,
    gerarAssinatura: form.get("gerarAssinatura") === "1", bloqueados: form.getAll("bloqueados").map(String) as PapelUsuario[],
  };
  if (dados.financeiro && dados.estoque !== "LANCAR") return { ok: false, mensagem: "Para lançar o financeiro, a situação também precisa lançar o estoque" };
  try {
    if (id) {
      const usada = await prisma.venda.count({ where: { situacaoId: id } });
      const antes = await prisma.situacaoVendaConfig.findUniqueOrThrow({ where: { id } });
      if (usada && (antes.estoque !== dados.estoque || antes.financeiro !== dados.financeiro))
        return { ok: false, mensagem: `${usada} venda(s) estão nesta situação: para mudar o estoque ou o financeiro, crie uma situação nova e mova as vendas.` };
    }
    await prisma.$transaction(async (tx) => {
      if (dados.padrao) await tx.situacaoVendaConfig.updateMany({ data: { padrao: false } });
      if (id) await tx.situacaoVendaConfig.update({ where: { id }, data: dados });
      else await tx.situacaoVendaConfig.create({ data: { ...dados, ordem: await tx.situacaoVendaConfig.count() } });
    });
  } catch (e) {
    return e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002" ? { ok: false, mensagem: "Já existe uma situação com esse nome" } : erro(e);
  }
  revalidatePath("/vendas/situacoes");
  redirect("/vendas/situacoes");
}

export async function moverSituacaoVendaAcao(id: string, direcao: -1 | 1) {
  await exigirUsuario(GER);
  const l = await prisma.situacaoVendaConfig.findMany({ orderBy: [{ ordem: "asc" }, { nome: "asc" }] });
  const i = l.findIndex((x) => x.id === id), j = i + direcao;
  if (i < 0 || j < 0 || j >= l.length) return;
  [l[i], l[j]] = [l[j], l[i]];
  await prisma.$transaction(l.map((x, k) => prisma.situacaoVendaConfig.update({ where: { id: x.id }, data: { ordem: k } })));
  revalidatePath("/vendas/situacoes");
}

export async function excluirSituacaoVendaAcao(id: string) {
  await exigirUsuario(GER);
  const n = await prisma.venda.count({ where: { situacaoId: id } });
  if (n) return { ok: false, mensagem: `${n} venda(s) estão nesta situação. Mude a situação delas antes.` };
  const s = await prisma.situacaoVendaConfig.findUniqueOrThrow({ where: { id } });
  if (s.padrao) return { ok: false, mensagem: "Escolha outra situação padrão antes de excluir esta" };
  await prisma.situacaoVendaConfig.delete({ where: { id } });
  revalidatePath("/vendas/situacoes");
  return { ok: true, mensagem: "Situação excluída" };
}

export async function salvarCanalAcao(_: Resultado, form: FormData): Promise<Resultado> {
  await exigirUsuario(GER);
  const id = String(form.get("id") || "");
  const nome = String(form.get("nome") ?? "").trim();
  if (!nome) return { ok: false, mensagem: "Informe o nome" };
  const padrao = form.get("padrao") === "1";
  try {
    await prisma.$transaction(async (tx) => {
      if (padrao) await tx.canalVenda.updateMany({ data: { padrao: false } });
      if (id) {
        const antes = await tx.canalVenda.findUniqueOrThrow({ where: { id } });
        await tx.canalVenda.update({ where: { id }, data: { nome, padrao } });
        if (antes.nome !== nome) {
          // o canal fica gravado pelo nome nos documentos
          await tx.venda.updateMany({ where: { canal: antes.nome }, data: { canal: nome } });
          await tx.orcamento.updateMany({ where: { canal: antes.nome }, data: { canal: nome } });
          await tx.ordemServico.updateMany({ where: { canal: antes.nome }, data: { canal: nome } });
        }
      } else await tx.canalVenda.create({ data: { nome, padrao, ordem: await tx.canalVenda.count() } });
    });
  } catch (e) {
    return e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002" ? { ok: false, mensagem: "Já existe um canal com esse nome" } : erro(e);
  }
  revalidatePath("/vendas/canais");
  redirect("/vendas/canais");
}

export async function excluirCanalAcao(id: string) {
  await exigirUsuario(GER);
  const c = await prisma.canalVenda.findUniqueOrThrow({ where: { id } });
  if (c.padrao) return { ok: false, mensagem: "Escolha outro canal padrão antes de excluir este" };
  await prisma.canalVenda.delete({ where: { id } });
  revalidatePath("/vendas/canais");
  return { ok: true, mensagem: "Canal excluído" };
}

export async function salvarMensagemVendaAcao(_: Resultado, form: FormData): Promise<Resultado> {
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
    if (padrao) await tx.modeloMensagem.updateMany({ where: { tipo: "VE" }, data: { padrao: false } });
    const dados = { tipo: "VE", assunto, email, sms: sms || null, padrao };
    if (id) await tx.modeloMensagem.update({ where: { id }, data: dados });
    else await tx.modeloMensagem.create({ data: dados });
  });
  revalidatePath("/vendas/mensagens");
  redirect("/vendas/mensagens");
}

export async function excluirMensagemVendaAcao(id: string) {
  await exigirUsuario(GER);
  await prisma.modeloMensagem.delete({ where: { id } });
  revalidatePath("/vendas/mensagens");
  return { ok: true, mensagem: "Mensagem excluída" };
}

export async function salvarConfigVendaAcao(_: Resultado, form: FormData): Promise<Resultado> {
  await exigirUsuario(GER);
  const ultimo = Math.trunc(Number(form.get("ultimoNumero")));
  if (!(ultimo >= 0)) return { ok: false, mensagem: "Último número inválido" };
  const maior = (await prisma.venda.aggregate({ _max: { numero: true } }))._max.numero ?? 0;
  if (ultimo < maior) return { ok: false, mensagem: `Já existe a venda nº ${maior}; o último número não pode ser menor.` };
  const ultimaDev = Math.trunc(Number(form.get("ultimaDevolucao") ?? 0)) || 0;
  const docs = ["numeroItem", "codigoProduto", "unidade", "imagemProduto", "descricaoProduto", "ncm", "valorUnitario", "subtotal", "descricaoServico", "imagemServico", "anexos", "imagemAnexo"];
  const valor = {
    observacoes: String(form.get("observacoes") ?? ""), validadeVale: Math.max(0, Math.trunc(Number(form.get("validadeVale") ?? 90)) || 0),
    estoqueNegativo: form.get("estoqueNegativo") === "1",
    documentos: Object.fromEntries(docs.map((k) => [k, form.get(k) === "1"])),
    balanca: { prefixo: String(form.get("balancaPrefixo") ?? "2").replace(/\D/g, "").slice(0, 2) || "2", digitosCodigo: Number(form.get("balancaDigitos")) === 5 ? 5 : 4, conteudo: form.get("balancaConteudo") === "PESO" ? "PESO" : "PRECO" },
  };
  await prisma.$transaction([
    prisma.sequencia.upsert({ where: { chave: "VENDA" }, create: { chave: "VENDA", valor: ultimo }, update: { valor: ultimo } }),
    prisma.sequencia.upsert({ where: { chave: "DEVOLUCAO" }, create: { chave: "DEVOLUCAO", valor: ultimaDev }, update: { valor: ultimaDev } }),
    prisma.configuracao.upsert({ where: { chave: "venda" }, create: { chave: "venda", valor }, update: { valor } }),
  ]);
  revalidatePath("/vendas", "layout");
  return { ok: true, mensagem: "Configurações salvas." };
}
