"use server";

import { exigirUsuario } from "@/lib/auth/atual";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db";
import { conciliarTx, desfazerTx, importarExtrato, lancarAvulsoTx, lerExtrato } from "@/lib/financeiro/extrato";
import { sincronizarInter } from "@/lib/financeiro/inter";
import { buscarRamos } from "@/lib/financeiro/conciliacao";
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
    const r = await importarExtrato(contaId, ts);
    await buscarRamos({ limite: 10 }).catch(() => null);
    return feito(resumo(r));
  } catch (e) { return falha(e); }
}

export async function puxarInter(_: Estado, form: FormData): Promise<Estado> {
  await exigirUsuario(["ADMIN", "GERENTE"]);
  try {
    const dias = Number(form.get("dias") || 7);
    const b = await sincronizarBoletos({ dias });
    const r = await sincronizarInter({ dias });
    await buscarRamos({ limite: 10 }).catch(() => null);
    return feito(`Inter (${r.conta}): ${resumo(r)}${b ? ` Boletos: ${b.baixados} pago(s) baixado(s)${b.erros.length ? ` · ${b.erros[0]}` : ""}.` : ""}`);
  } catch (e) { return falha(e); }
}

export type ItemLote = {
  transacaoId: string; acao: "BAIXAR" | "LANCAR"; lancamentoId?: string | null; categoriaId?: string | null; centroCustoId?: string | null;
  /** lançamento avulso: descrição e competência (AAAA-MM-DD) sugeridas, ex. "Salário 10/2026 - FULANO" */
  descricao?: string | null; competencia?: string | null;
};

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
        await prisma.$transaction((tx) => lancarAvulsoTx(tx, it.transacaoId, String(it.categoriaId), it.descricao ? String(it.descricao).slice(0, 300) : undefined, it.centroCustoId || null,
          it.competencia && /^\d{4}-\d{2}-\d{2}$/.test(it.competencia) ? new Date(`${it.competencia}T00:00:00Z`) : null));
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

/** Consulta o CNPJ dos favorecidos de despesas para achar o ramo de atividade (CNAE) e sugerir a categoria. */
export async function buscarRamosAcao(): Promise<Estado> {
  await exigirUsuario(["ADMIN", "GERENTE"]);
  try {
    const r = await buscarRamos({ limite: 20 });
    if (!r.consultados) return feito("Nenhum favorecido novo com CNPJ conhecido. Abra a linha (⋮) e informe o CNPJ de quem recebeu.");
    return feito(`${r.consultados} CNPJ consultado(s), ${r.achados} com ramo de atividade.${r.erros.length ? ` Falhas: ${[...new Set(r.erros)].slice(0, 2).join("; ")}` : ""}`);
  } catch (e) { return falha(e); }
}

/** Grava o CNPJ que a pessoa digitou para um favorecido do extrato e consulta o ramo dele. */
export async function informarCnpjFavorecido(chave: string, documento: string): Promise<Estado> {
  await exigirUsuario(["ADMIN", "GERENTE"]);
  try {
    const r = await buscarRamos({ chave: String(chave), documento: String(documento) });
    if (r.erros.length) return { ok: false, mensagem: `CNPJ gravado, mas a consulta falhou: ${r.erros[0]}` };
    return feito(r.achados ? "Ramo de atividade encontrado." : "CNPJ gravado, sem CNAE na consulta.");
  } catch (e) { return falha(e); }
}
