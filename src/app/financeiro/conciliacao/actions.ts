"use server";

import { exigirUsuario } from "@/lib/auth/atual";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db";
import { conciliarTx, desfazerTx, importarExtrato, lancarAvulsoTx, lerExtrato } from "@/lib/financeiro/extrato";
import { sincronizarInter } from "@/lib/financeiro/inter";
import { sincronizarBoletos } from "@/lib/financeiro/boletos";

export type Estado = { ok: boolean; mensagem: string } | null;
const str = (x: FormDataEntryValue | null) => String(x ?? "").trim();
const feito = (mensagem: string): Estado => { revalidatePath("/financeiro/conciliacao"); revalidatePath("/financeiro"); return { ok: true, mensagem }; };
const falha = (e: unknown): Estado => ({ ok: false, mensagem: e instanceof Error ? e.message : String(e) });

const resumo = (r: { novas: number; repetidas: number; baixadas: number }) =>
  `${r.novas} transações novas${r.repetidas ? ` (${r.repetidas} já tinham vindo antes)` : ""}, ${r.baixadas} contas baixadas automaticamente.`;

export async function enviarExtrato(_: Estado, form: FormData): Promise<Estado> {
  await exigirUsuario(["ADMIN", "GERENTE"]);
  const arquivo = form.get("arquivo");
  const contaId = str(form.get("contaBancariaId"));
  if (!(arquivo instanceof File) || arquivo.size === 0) return { ok: false, mensagem: "Escolha o arquivo do extrato" };
  if (!contaId) return { ok: false, mensagem: "Escolha a conta bancária do extrato" };
  try {
    const ts = await lerExtrato(arquivo.name, Buffer.from(await arquivo.arrayBuffer()));
    return feito(resumo(await importarExtrato(contaId, ts)));
  } catch (e) { return falha(e); }
}

export async function puxarInter(_: Estado, form: FormData): Promise<Estado> {
  await exigirUsuario(["ADMIN", "GERENTE"]);
  try {
    const dias = Number(form.get("dias") || 7);
    const b = await sincronizarBoletos({ dias });
    const r = await sincronizarInter({ dias });
    return feito(`Inter (${r.conta}): ${resumo(r)}${b ? ` Boletos: ${b.baixados} pago(s) baixado(s)${b.erros.length ? ` · ${b.erros[0]}` : ""}.` : ""}`);
  } catch (e) { return falha(e); }
}

export type ItemLote = { transacaoId: string; acao: "BAIXAR" | "LANCAR"; lancamentoId?: string | null; categoriaId?: string | null; centroCustoId?: string | null };

/**
 * Confirma várias linhas de uma vez (ou uma só, pelo botão da linha). Cada linha numa transação: uma que falhe
 * (já conciliada por outra pessoa, conta já baixada) não desfaz as outras.
 */
export async function confirmarLote(itens: ItemLote[]): Promise<Estado> {
  await exigirUsuario(["ADMIN", "GERENTE"]);
  if (!Array.isArray(itens) || !itens.length) return { ok: false, mensagem: "Marque ao menos uma linha" };
  let baixadas = 0, lancadas = 0;
  const erros: string[] = [];
  for (const it of itens.slice(0, 1000)) {
    try {
      if (it.acao === "BAIXAR") {
        if (!it.lancamentoId) throw new Error("escolha a conta a baixar");
        await prisma.$transaction((tx) => conciliarTx(tx, it.transacaoId, [String(it.lancamentoId)], { centroCustoId: it.centroCustoId || null }));
        baixadas++;
      } else if (it.acao === "LANCAR") {
        if (!it.categoriaId) throw new Error("escolha a categoria");
        await prisma.$transaction((tx) => lancarAvulsoTx(tx, it.transacaoId, String(it.categoriaId), undefined, it.centroCustoId || null));
        lancadas++;
      }
    } catch (e) {
      erros.push(e instanceof Error ? e.message : String(e));
    }
  }
  const partes = [baixadas && `${baixadas} conta${baixadas > 1 ? "s" : ""} baixada${baixadas > 1 ? "s" : ""}`, lancadas && `${lancadas} lançamento${lancadas > 1 ? "s" : ""} avulso${lancadas > 1 ? "s" : ""}`].filter(Boolean).join(" e ");
  revalidatePath("/financeiro/conciliacao"); revalidatePath("/financeiro");
  return { ok: !erros.length, mensagem: `${partes || "Nada conciliado"}.${erros.length ? ` ${erros.length} com erro: ${[...new Set(erros)].slice(0, 2).join("; ")}` : ""}` };
}

export async function ignorarLote(ids: string[]): Promise<Estado> {
  await exigirUsuario(["ADMIN", "GERENTE"]);
  if (!Array.isArray(ids) || !ids.length) return { ok: false, mensagem: "Marque ao menos uma linha" };
  const r = await prisma.transacaoBancaria.updateMany({ where: { id: { in: ids.map(String) }, situacao: "PENDENTE" }, data: { situacao: "IGNORADA" } });
  return feito(`${r.count} linha${r.count === 1 ? "" : "s"} ignorada${r.count === 1 ? "" : "s"}`);
}

export async function desfazer(form: FormData) {
  await exigirUsuario(["ADMIN", "GERENTE"]);
  await prisma.$transaction((tx) => desfazerTx(tx, str(form.get("transacaoId"))));
  feito("");
}
