"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import type { PapelUsuario } from "@prisma/client";
import { prisma } from "@/lib/db";
import { exigirAcao, exigirUsuario } from "@/lib/auth/atual";
import { alterarSituacaoCompra, dadosDaCompra, excluirCompra, salvarCompra } from "./compras";
import { itensDoFornecedor, responderCotacao, salvarCotacao, type DadosCotacao } from "./cotacoes";
import type { DadosCompra } from "./tipos";
import { cancelarInventario, concluirInventario, criarAjuste, criarInventario, criarTransferencia, lerCodigo, registrarContagem, resumoInventario, zerarEstoque, type DadosAjuste, type DadosInventario, type DadosTransferencia } from "@/lib/estoque/documentos";
import { PADRAO_ESTOQUE } from "@/lib/estoque/config";
import { PODE_LANCAR_ESTOQUE } from "./papeis";

export type Resultado = { ok: boolean; mensagem: string } | null;
const COMPRA: PapelUsuario[] = [...PODE_LANCAR_ESTOQUE];
const GER: PapelUsuario[] = ["ADMIN", "GERENTE"];
const erro = (e: unknown) => ({ ok: false, mensagem: e instanceof Error ? e.message : String(e) });
const baseCompras = (tipo: string) => (tipo === "SERVICO" ? "/compras/servicos" : "/compras");

async function anexar(form: FormData, entidade: string, entidadeId: string, usuarioId: string) {
  const anexos = form.getAll("anexos").filter((a): a is File => a instanceof File && a.size > 0);
  if (anexos.length > 10) throw new Error("No máximo 10 anexos");
  for (const a of anexos) {
    if (a.size > 5 * 1024 * 1024) throw new Error(`O anexo ${a.name} passa de 5 MB`);
    await prisma.anexo.create({ data: { entidade, entidadeId, nome: a.name, tipo: a.type || "application/octet-stream", tamanho: a.size, dados: Buffer.from(await a.arrayBuffer()), usuarioId } });
  }
}

// ---------- compras

export async function salvarCompraForm(_: Resultado, form: FormData): Promise<Resultado> {
  const u = await exigirUsuario(COMPRA);
  let destino: string;
  try {
    const d = JSON.parse(String(form.get("dados"))) as DadosCompra & { id?: string };
    const c = await salvarCompra(d, u, d.id);
    await anexar(form, "COMPRA", c.id, u.id);
    revalidatePath(baseCompras(c.tipo));
    destino = `/compras/${c.id}`;
  } catch (e) { return erro(e); }
  redirect(destino);
}

export async function alterarSituacaoCompraAcao(_: Resultado, form: FormData): Promise<Resultado> {
  const u = await exigirUsuario(COMPRA);
  try {
    const r = await alterarSituacaoCompra(String(form.get("id")), String(form.get("situacaoId")), u, { observacao: String(form.get("observacao") ?? ""), forcar: form.get("forcar") === "1" });
    revalidatePath("/compras", "layout");
    return { ok: true, mensagem: `Situação alterada para ${r.para.nome}.` };
  } catch (e) { return erro(e); }
}

export async function situacaoComprasEmMassaAcao(_: Resultado, form: FormData): Promise<Resultado> {
  const u = await exigirUsuario(COMPRA);
  const ids = form.getAll("ids").map(String);
  if (!ids.length) return { ok: false, mensagem: "Marque as compras na lista" };
  const sit = String(form.get("situacaoId") ?? "");
  if (!sit) return { ok: false, mensagem: "Escolha a situação" };
  let ok = 0; const falhas: string[] = [];
  for (const id of ids) { try { await alterarSituacaoCompra(id, sit, u); ok++; } catch (e) { falhas.push(e instanceof Error ? e.message : String(e)); } }
  revalidatePath("/compras", "layout");
  return { ok: true, mensagem: `${ok} compra(s) alterada(s).${falhas.length ? ` ${falhas.length} não puderam: ${falhas[0]}` : ""}` };
}

export async function clonarCompraAcao(id: string) {
  const u = await exigirUsuario(COMPRA);
  let destino: string;
  try {
    const d = await dadosDaCompra(id, true);
    const c = await salvarCompra({ ...d, situacaoId: (await prisma.situacaoCompraConfig.findFirst({ where: { lancamento: "NAO" }, orderBy: { ordem: "asc" } }))?.id ?? "" }, u);
    destino = `/compras/${c.id}/editar`;
  } catch (e) { return erro(e); }
  redirect(destino);
}

export async function excluirCompraAcao(id: string) {
  const u = await exigirAcao("compra.excluir");
  try { const n = await excluirCompra(id, u); revalidatePath("/compras", "layout"); return { ok: true, mensagem: `Compra nº ${n} excluída.` }; } catch (e) { return erro(e); }
}

export async function excluirCompraEVoltarAcao(id: string, voltar: string) {
  const r = await excluirCompraAcao(id);
  if (!r.ok) return r;
  redirect(voltar.startsWith("/") && !voltar.startsWith("//") ? voltar : "/compras"); // só volta para dentro do sistema
}

export async function excluirComprasAcao(_: Resultado, form: FormData): Promise<Resultado> {
  const u = await exigirAcao("compra.excluir");
  const ids = form.getAll("ids").map(String);
  if (!ids.length) return { ok: false, mensagem: "Marque as compras na lista" };
  let ok = 0; const falhas: string[] = [];
  for (const id of ids) { try { await excluirCompra(id, u); ok++; } catch (e) { falhas.push(e instanceof Error ? e.message : String(e)); } }
  revalidatePath("/compras", "layout");
  return { ok: true, mensagem: `${ok} compra(s) excluída(s).${falhas.length ? ` ${falhas.length} não puderam: ${falhas[0]}` : ""}` };
}

export async function anotarCompraAcao(_: Resultado, form: FormData): Promise<Resultado> {
  const u = await exigirUsuario();
  const texto = String(form.get("texto") ?? "").trim();
  if (!texto) return { ok: false, mensagem: "Escreva a anotação" };
  await prisma.anotacao.create({ data: { entidade: "COMPRA", entidadeId: String(form.get("entidadeId")), texto, usuarioId: u.id } });
  revalidatePath(String(form.get("caminho") || "/compras"));
  return { ok: true, mensagem: "Anotação registrada" };
}

async function anotar(entidade: string, form: FormData): Promise<Resultado> {
  const u = await exigirUsuario();
  const texto = String(form.get("texto") ?? "").trim();
  if (!texto) return { ok: false, mensagem: "Escreva a anotação" };
  await prisma.anotacao.create({ data: { entidade, entidadeId: String(form.get("entidadeId")), texto, usuarioId: u.id } });
  revalidatePath(String(form.get("caminho") || "/estoque"));
  return { ok: true, mensagem: "Anotação registrada" };
}
export async function anotarAjusteAcao(_: Resultado, form: FormData) { return anotar("AJUSTE", form); }
export async function anotarTransferenciaAcao(_: Resultado, form: FormData) { return anotar("TRANSFERENCIA", form); }
export async function anotarCotacaoAcao(_: Resultado, form: FormData) { return anotar("COTACAO", form); }

// ---------- situações de compra

export async function salvarSituacaoCompraAcao(_: Resultado, form: FormData): Promise<Resultado> {
  await exigirUsuario(GER);
  const id = String(form.get("id") || "");
  const nome = String(form.get("nome") ?? "").trim();
  if (!nome) return { ok: false, mensagem: "Informe o nome" };
  const lanc = String(form.get("lancamento"));
  const dados = {
    nome, cor: String(form.get("cor") || "cinza"), padrao: form.get("padrao") === "1", exibir: form.get("exibir") !== "0", permiteEdicao: form.get("permiteEdicao") !== "0",
    lancamento: ["NAO", "AMBOS", "ESTOQUE", "FINANCEIRO"].includes(lanc) ? lanc : "NAO", bloqueados: form.getAll("bloqueados").map(String),
  };
  try {
    if (id) {
      const usada = await prisma.compra.count({ where: { situacaoId: id } });
      const antes = await prisma.situacaoCompraConfig.findUniqueOrThrow({ where: { id } });
      if (usada && antes.lancamento !== dados.lancamento)
        return { ok: false, mensagem: `${usada} compra(s) estão nesta situação: para mudar o que ela lança, crie uma situação nova e mova as compras.` };
    }
    await prisma.$transaction(async (tx) => {
      if (dados.padrao) await tx.situacaoCompraConfig.updateMany({ data: { padrao: false } });
      if (id) await tx.situacaoCompraConfig.update({ where: { id }, data: dados });
      else await tx.situacaoCompraConfig.create({ data: { ...dados, ordem: (await tx.situacaoCompraConfig.count()) + 1 } });
    });
  } catch (e) { return erro(e); }
  revalidatePath("/compras/situacoes");
  redirect("/compras/situacoes");
}

export async function moverSituacaoCompraAcao(id: string, direcao: -1 | 1) {
  await exigirUsuario(GER);
  const l = await prisma.situacaoCompraConfig.findMany({ orderBy: [{ ordem: "asc" }, { nome: "asc" }] });
  const i = l.findIndex((x) => x.id === id), j = i + direcao;
  if (i < 0 || j < 0 || j >= l.length) return;
  [l[i], l[j]] = [l[j], l[i]];
  await prisma.$transaction(l.map((x, k) => prisma.situacaoCompraConfig.update({ where: { id: x.id }, data: { ordem: k } })));
  revalidatePath("/compras/situacoes");
}

export async function excluirSituacaoCompraAcao(id: string) {
  await exigirUsuario(GER);
  const n = await prisma.compra.count({ where: { situacaoId: id } });
  if (n) return { ok: false, mensagem: `${n} compra(s) estão nesta situação. Mude a situação delas antes.` };
  const s = await prisma.situacaoCompraConfig.findUniqueOrThrow({ where: { id } });
  if (s.padrao) return { ok: false, mensagem: "Escolha outra situação padrão antes de excluir esta" };
  await prisma.situacaoCompraConfig.delete({ where: { id } });
  revalidatePath("/compras/situacoes");
  return { ok: true, mensagem: "Situação excluída" };
}

// ---------- modelos de e-mail (compras e cotações)

export async function salvarMensagemCompraAcao(_: Resultado, form: FormData): Promise<Resultado> {
  return salvarMensagem("COMPRA", form);
}

export async function salvarMensagemCotacaoAcao(_: Resultado, form: FormData): Promise<Resultado> {
  return salvarMensagem("COTACAO", form);
}

async function salvarMensagem(tipo: "COMPRA" | "COTACAO", form: FormData): Promise<Resultado> {
  await exigirUsuario(GER);
  const id = String(form.get("id") || "");
  const assunto = String(form.get("assunto") ?? "").trim();
  const email = String(form.get("email") ?? "").trim();
  const padrao = form.get("padrao") === "1";
  if (!assunto) return { ok: false, mensagem: "Informe o assunto" };
  if (assunto.length > 80) return { ok: false, mensagem: "O assunto tem no máximo 80 caracteres" };
  if (!email) return { ok: false, mensagem: "Escreva a mensagem do e-mail" };
  await prisma.$transaction(async (tx) => {
    if (padrao) await tx.modeloMensagem.updateMany({ where: { tipo }, data: { padrao: false } });
    const dados = { tipo, assunto, email, padrao };
    if (id) await tx.modeloMensagem.update({ where: { id }, data: dados });
    else await tx.modeloMensagem.create({ data: dados });
  });
  revalidatePath("/compras/mensagens");
  redirect("/compras/mensagens");
}

export async function excluirMensagemCompraAcao(id: string) {
  await exigirUsuario(GER);
  await prisma.modeloMensagem.delete({ where: { id } });
  revalidatePath("/compras/mensagens");
  return { ok: true, mensagem: "Mensagem excluída" };
}

// ---------- configurações de estoque

export async function salvarConfigEstoqueAcao(_: Resultado, form: FormData): Promise<Resultado> {
  await exigirUsuario(GER);
  const s = (k: string) => String(form.get(k) ?? "");
  const um = <T extends string>(k: string, ok: readonly T[], padrao: T) => (ok.includes(s(k) as T) ? (s(k) as T) : padrao);
  const LOTE = ["VENCER", "ENTRAR", "MANUAL"] as const;
  const valor = {
    custoCompra: um("custoCompra", ["MEDIA", "ULTIMA", "NAO"] as const, "MEDIA"),
    controleLote: form.get("controleLote") === "1", saidaLotePdv: um("saidaLotePdv", LOTE, "VENCER"), loteVendas: um("loteVendas", LOTE, "VENCER"),
    localizacao: form.get("localizacao") === "1", avisoCotacao: um("avisoCotacao", ["AMBOS", "SISTEMA", "EMAIL", "NAO"] as const, "SISTEMA"),
    textoCompras: s("textoCompras"), textoCotacoes: s("textoCotacoes"),
    documentos: Object.fromEntries(Object.keys(PADRAO_ESTOQUE.documentos).map((k) => [k, form.get(`doc_${k}`) === "1"])),
    xml: { frete: form.get("xmlFrete") === "1", desconto: form.get("xmlDesconto") === "1", impostos: form.get("xmlImpostos") === "1", outras: form.get("xmlOutras") === "1", vincularPor: um("vincularPor", ["NOME", "CODIGO", "AMBOS"] as const, "AMBOS") },
  };
  // "Último número" de cada documento
  const seqs = [["COTACAO", "cotacao", prisma.cotacao], ["COMPRA", "compra", prisma.compra], ["AJUSTE", "ajuste", prisma.ajusteEstoque], ["TRANSFERENCIA", "transferencia", prisma.transferenciaEstoque]] as const;
  try {
    for (const [chave, campo, tabela] of seqs) {
      const v = Math.trunc(Number(form.get(`ultimo_${campo}`)));
      if (!(v >= 0)) return { ok: false, mensagem: "Último número inválido" };
      const maior = (await (tabela as typeof prisma.compra).aggregate({ _max: { numero: true } }))._max.numero ?? 0;
      if (v < maior) return { ok: false, mensagem: `Já existe o nº ${maior} em ${campo === "cotacao" ? "cotações" : campo === "compra" ? "compras" : campo === "ajuste" ? "ajustes" : "transferências"}; o último número não pode ser menor.` };
      await prisma.sequencia.upsert({ where: { chave }, create: { chave, valor: v }, update: { valor: v } });
    }
    await prisma.configuracao.upsert({ where: { chave: "estoque" }, create: { chave: "estoque", valor }, update: { valor } });
  } catch (e) { return erro(e); }
  revalidatePath("/estoque/configuracoes");
  return { ok: true, mensagem: "Configurações salvas" };
}

// ---------- ajustes

export async function salvarAjusteForm(_: Resultado, form: FormData): Promise<Resultado> {
  const u = await exigirAcao("estoque.ajuste");
  let destino: string;
  try {
    const a = await criarAjuste(JSON.parse(String(form.get("dados"))) as DadosAjuste, u);
    revalidatePath("/estoque/ajustes");
    destino = `/estoque/ajustes/${a.id}`;
  } catch (e) { return erro(e); }
  redirect(destino);
}

export async function zerarEstoqueAcao(_: Resultado, form: FormData): Promise<Resultado> {
  const u = await exigirAcao("estoque.zerar");
  if (String(form.get("confirmacao") ?? "").trim().toUpperCase() !== "ZERAR") return { ok: false, mensagem: "Digite ZERAR para confirmar" };
  let destino: string;
  try {
    const a = await zerarEstoque(u, String(form.get("observacao") ?? "").trim() || "Estoque zerado");
    revalidatePath("/estoque", "layout");
    destino = `/estoque/ajustes/${a.id}`;
  } catch (e) { return erro(e); }
  redirect(destino);
}

// ---------- transferências

export async function salvarTransferenciaForm(_: Resultado, form: FormData): Promise<Resultado> {
  const u = await exigirUsuario(COMPRA);
  let destino: string;
  try {
    const t = await criarTransferencia(JSON.parse(String(form.get("dados"))) as DadosTransferencia, u);
    revalidatePath("/estoque/transferencias");
    destino = `/estoque/transferencias/${t.id}`;
  } catch (e) { return erro(e); }
  redirect(destino);
}

// ---------- inventários

export async function salvarInventarioForm(_: Resultado, form: FormData): Promise<Resultado> {
  await exigirUsuario(COMPRA);
  let destino: string;
  try {
    const i = await criarInventario(JSON.parse(String(form.get("dados"))) as DadosInventario);
    revalidatePath("/estoque/inventarios");
    destino = `/estoque/inventarios/${i.id}`;
  } catch (e) { return erro(e); }
  redirect(destino);
}

export async function resumoInventarioAcao(escopo: DadosInventario["escopo"], ids: string[]) {
  await exigirUsuario(COMPRA);
  return resumoInventario(escopo, ids);
}

export async function lerCodigoAcao(_: Resultado, form: FormData): Promise<Resultado> {
  await exigirUsuario(COMPRA);
  const id = String(form.get("id"));
  try {
    const r = await lerCodigo(id, String(form.get("codigo") ?? ""), Number(String(form.get("quantidade") || "1").replace(",", ".")) || 1);
    revalidatePath(`/estoque/inventarios/${id}`);
    return { ok: true, mensagem: `${r.produto}: ${r.contado.toLocaleString("pt-BR")}` };
  } catch (e) { return erro(e); }
}

export async function registrarContagemAcao(_: Resultado, form: FormData): Promise<Resultado> {
  await exigirUsuario(COMPRA);
  const id = String(form.get("id"));
  const contagens = [...form.entries()].filter(([k]) => k.startsWith("c_")).map(([k, v]) => ({ itemId: k.slice(2), contado: String(v) }));
  try {
    await registrarContagem(id, contagens);
    revalidatePath(`/estoque/inventarios/${id}`);
    return { ok: true, mensagem: "Contagem salva" };
  } catch (e) { return erro(e); }
}

export async function concluirInventarioAcao(id: string) {
  const u = await exigirUsuario(GER);
  try {
    const r = await concluirInventario(id, u);
    revalidatePath("/estoque", "layout");
    return { ok: true, mensagem: `Inventário concluído: ${r.contados} produto(s) contados, ${r.ajustes.length} ajuste(s) gerado(s).` };
  } catch (e) { return erro(e); }
}

export async function cancelarInventarioAcao(id: string) {
  await exigirUsuario(GER);
  try { await cancelarInventario(id); revalidatePath("/estoque/inventarios", "layout"); return { ok: true, mensagem: "Inventário cancelado" }; } catch (e) { return erro(e); }
}

// ---------- cotações

export async function salvarCotacaoForm(_: Resultado, form: FormData): Promise<Resultado> {
  const u = await exigirUsuario(COMPRA);
  let destino: string;
  try {
    const d = JSON.parse(String(form.get("dados"))) as DadosCotacao & { id?: string };
    const c = await salvarCotacao(d, u, d.id);
    await anexar(form, "COTACAO", c.id, u.id);
    revalidatePath("/compras/cotacoes");
    destino = `/compras/cotacoes/${c.id}`;
  } catch (e) { return erro(e); }
  redirect(destino);
}

export async function itensDoFornecedorAcao(fornecedorId: string) {
  await exigirUsuario(COMPRA);
  return itensDoFornecedor(fornecedorId);
}

export async function cancelarCotacaoAcao(id: string) {
  await exigirUsuario(COMPRA);
  await prisma.cotacao.update({ where: { id }, data: { situacao: "CANCELADA" } });
  revalidatePath("/compras/cotacoes", "layout");
  return { ok: true, mensagem: "Cotação cancelada" };
}

export async function excluirCotacaoAcao(id: string) {
  await exigirUsuario(GER);
  await prisma.anexo.deleteMany({ where: { entidade: "COTACAO", entidadeId: id } });
  await prisma.cotacao.delete({ where: { id } });
  revalidatePath("/compras/cotacoes");
  return { ok: true, mensagem: "Cotação excluída" };
}

/** Página pública do fornecedor: não exige login (o token do link é a autorização). */
export async function responderCotacaoAcao(_: Resultado, form: FormData): Promise<Resultado> {
  const token = String(form.get("token") ?? "");
  const valores = Object.fromEntries([...form.entries()].filter(([k]) => k.startsWith("v_")).map(([k, v]) => [k.slice(2), String(v)]));
  try {
    await responderCotacao(token, { valores, frete: String(form.get("frete") ?? ""), prazoEntrega: String(form.get("prazoEntrega") ?? ""), condicao: String(form.get("condicao") ?? ""), observacao: String(form.get("observacao") ?? "") });
    revalidatePath(`/cotacao/${token}`);
    return { ok: true, mensagem: "Obrigado! Sua resposta foi enviada. Você pode corrigir os valores enquanto a cotação estiver aberta." };
  } catch (e) { return erro(e); }
}
