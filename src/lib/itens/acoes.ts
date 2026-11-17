"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { exigirUsuario } from "@/lib/auth/atual";
import { ajustarValoresEmMassa, clonarProduto, excluirProduto, gerarCodigoProduto, salvarProduto } from "./produtos";
import { salvarServico, excluirServico, gerarCodigoServico } from "./servicos";
import { whereProdutos } from "./filtros";
import { lerNumero, type DadosProduto, type DadosServico } from "./tipos";

export type Resultado = { ok: boolean; mensagem: string } | null;
const EDITA = ["ADMIN", "GERENTE", "OPERADOR", "TECNICO"] as const;
const LIMITE = 5 * 1024 * 1024;
const erro = (e: unknown) => ({ ok: false, mensagem: e instanceof Error ? e.message : String(e) });

async function gravarFotos(entidade: "FOTO_PRODUTO" | "FOTO_SERVICO", id: string, form: FormData, usuarioId: string) {
  const fotos = form.getAll("fotos").filter((f): f is File => f instanceof File && f.size > 0);
  let ordem = await prisma.anexo.count({ where: { entidade, entidadeId: id } });
  if (ordem + fotos.length > 10) throw new Error("No máximo 10 fotos por item");
  for (const f of fotos) {
    if (f.size > LIMITE) throw new Error(`A foto ${f.name} passa de 5 MB`);
    if (!/^image\/(jpeg|png|gif|webp)$/.test(f.type)) throw new Error(`A foto ${f.name} deve ser JPG, PNG ou GIF`);
    await prisma.anexo.create({ data: { entidade, entidadeId: id, ordem: ordem++, nome: f.name, tipo: f.type, tamanho: f.size, dados: Buffer.from(await f.arrayBuffer()), usuarioId } });
  }
  const remover = form.getAll("removerFoto").map(String);
  if (remover.length) await prisma.anexo.deleteMany({ where: { id: { in: remover }, entidade, entidadeId: id } });
  const ordemNova = String(form.get("ordemFotos") ?? "").split(",").filter(Boolean);
  for (const [i, fid] of ordemNova.entries()) await prisma.anexo.updateMany({ where: { id: fid, entidade, entidadeId: id }, data: { ordem: i } });
}

export async function salvarProdutoForm(_: Resultado, form: FormData): Promise<Resultado> {
  const u = await exigirUsuario([...EDITA]);
  let destino: string;
  try {
    const d = JSON.parse(String(form.get("dados"))) as DadosProduto & { id?: string };
    const p = await salvarProduto(d, u.id, d.id);
    await gravarFotos("FOTO_PRODUTO", p.id, form, u.id);
    revalidatePath("/produtos");
    destino = `/produtos/${p.id}`;
  } catch (e) { return erro(e); }
  redirect(destino);
}

export async function gerarCodigoAcao() {
  await exigirUsuario([...EDITA]);
  return gerarCodigoProduto();
}

export async function excluirProdutoAcao(id: string) {
  await exigirUsuario([...EDITA]);
  try { const r = await excluirProduto(id); revalidatePath("/produtos"); return r; } catch (e) { return erro(e); }
}

export async function clonarProdutoAcao(id: string) {
  const u = await exigirUsuario([...EDITA]);
  const p = await clonarProduto(id, u.id);
  redirect(`/produtos/${p.id}/editar`);
}

/** Mais ações › Ajustar valores em massa (sobre os produtos filtrados na lista). */
export async function ajustarValoresAcao(_: Resultado, form: FormData): Promise<Resultado> {
  const u = await exigirUsuario(["ADMIN", "GERENTE"]);
  try {
    const filtros = JSON.parse(String(form.get("filtros") || "{}"));
    const modo = form.get("modo") === "lucro" ? "lucro" : "percentual";
    const percentual = lerNumero(String(form.get("percentual") ?? ""));
    if (modo === "percentual" && !percentual) return { ok: false, mensagem: "Informe o percentual (ex.: 10 ou -5)" };
    const n = await ajustarValoresEmMassa(await whereProdutos(filtros), { tipoValorId: String(form.get("tipoValorId")), modo, percentual: percentual ?? 0 }, u.id);
    revalidatePath("/produtos");
    return { ok: true, mensagem: `${n} produto(s) com valor ajustado.` };
  } catch (e) { return erro(e); }
}

/** Mais ações › Ajustar produtos em massa: grupo, situação, NCM, unidade, comissão, PDV. */
export async function ajustarProdutosAcao(_: Resultado, form: FormData): Promise<Resultado> {
  await exigirUsuario(["ADMIN", "GERENTE"]);
  try {
    const ids = form.getAll("ids").map(String);
    if (!ids.length) return { ok: false, mensagem: "Marque os produtos na lista" };
    const g = (k: string) => String(form.get(k) ?? "").trim();
    const data: Prisma.ProdutoUpdateManyMutationInput & { grupoId?: string | null } = {};
    if (g("grupoId")) data.grupoId = g("grupoId") === "-" ? null : g("grupoId");
    if (g("ativo")) data.ativo = g("ativo") === "sim";
    if (g("vendePdv")) data.vendePdv = g("vendePdv") === "sim";
    if (g("ncm")) data.ncm = g("ncm").replace(/\D/g, "");
    if (g("unidade")) data.unidade = g("unidade").toUpperCase();
    if (g("comissao")) data.comissao = lerNumero(g("comissao"));
    if (!Object.keys(data).length) return { ok: false, mensagem: "Escolha ao menos uma alteração" };
    const r = await prisma.produto.updateMany({ where: { id: { in: ids } }, data });
    revalidatePath("/produtos");
    return { ok: true, mensagem: `${r.count} produto(s) alterado(s).` };
  } catch (e) { return erro(e); }
}

export async function excluirProdutosAcao(_: Resultado, form: FormData): Promise<Resultado> {
  await exigirUsuario(["ADMIN", "GERENTE"]);
  const ids = form.getAll("ids").map(String);
  if (!ids.length) return { ok: false, mensagem: "Marque os produtos na lista" };
  let exc = 0, inat = 0;
  for (const id of ids) { const r = await excluirProduto(id); if (/inativado/.test(r.mensagem)) inat++; else exc++; }
  revalidatePath("/produtos");
  return { ok: true, mensagem: `${exc} excluído(s), ${inat} inativado(s) por terem movimentações.` };
}

// ---------- serviços

export async function gerarCodigoServicoAcao() {
  await exigirUsuario([...EDITA]);
  return gerarCodigoServico();
}

export async function salvarServicoForm(_: Resultado, form: FormData): Promise<Resultado> {
  const u = await exigirUsuario([...EDITA]);
  let destino: string;
  try {
    const d = JSON.parse(String(form.get("dados"))) as DadosServico & { id?: string };
    const s = await salvarServico(d, d.id);
    await gravarFotos("FOTO_SERVICO", s.id, form, u.id);
    revalidatePath("/servicos");
    destino = `/servicos/${s.id}`;
  } catch (e) { return erro(e); }
  redirect(destino);
}

export async function excluirServicoAcao(id: string) {
  await exigirUsuario([...EDITA]);
  try { const r = await excluirServico(id); revalidatePath("/servicos"); return r; } catch (e) { return erro(e); }
}

export async function excluirServicosAcao(_: Resultado, form: FormData): Promise<Resultado> {
  await exigirUsuario(["ADMIN", "GERENTE"]);
  const ids = form.getAll("ids").map(String);
  if (!ids.length) return { ok: false, mensagem: "Marque os serviços na lista" };
  const rs = await Promise.all(ids.map((id) => excluirServico(id)));
  revalidatePath("/servicos");
  return { ok: true, mensagem: rs.map((r) => r.mensagem).join(" ") };
}

// ---------- conversão de unidade (Alterar conversão, na aba Estoque do produto)

export async function simularConversaoAcao(produtoId: string, unidadeCompra: string, fator: string) {
  await exigirUsuario([...EDITA]);
  const { simularConversao } = await import("./conversao");
  const r = await simularConversao(produtoId, unidadeCompra, fator);
  return { ...r, compras: r.compras.map((c) => ({ ...c, data: c.data.toISOString().slice(0, 10) })) };
}

export async function alterarConversaoForm(_: Resultado, form: FormData): Promise<Resultado> {
  const u = await exigirUsuario([...EDITA]);
  const { alterarConversao } = await import("./conversao");
  const id = String(form.get("produtoId"));
  let destino: string;
  try {
    const base = String(form.get("base") ?? "PROPORCIONAL") as "PROPORCIONAL" | "ULTIMA" | "MEDIA" | "MANTER";
    const r = await alterarConversao(id, {
      unidadeCompra: form.get("converte") ? String(form.get("unidadeCompra") ?? "") : "", fator: String(form.get("fator") ?? ""), base,
      corrigirCompras: !!form.get("corrigirCompras"), corrigirLancados: !!form.get("corrigirLancados"),
    }, u);
    revalidatePath(`/produtos/${id}`);
    const msg = [`Custo ${r.custoAntes.toFixed(4)} → ${r.custo.toFixed(4)}`, r.corrigidas ? `${r.corrigidas} compra(s) corrigida(s)` : "", r.lancados ? `${r.lancados} lançamento(s) com custo atualizado` : "", ...r.avisos].filter(Boolean).join(". ");
    destino = `/produtos/${id}?aba=estoque&ok=${encodeURIComponent(msg)}`;
  } catch (e) { return erro(e); }
  redirect(destino);
}
