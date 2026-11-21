"use server";

import { exigirUsuario } from "@/lib/auth/atual";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db";
import { conciliarLinhasTx, conciliarTx, desfazerTx, importarExtrato, lancarAvulsoTx, lerExtrato } from "@/lib/financeiro/extrato";
import { sincronizarInter } from "@/lib/financeiro/inter";
import { aprenderRegra, buscarRamos } from "@/lib/financeiro/conciliacao";
import { todasAsLojas } from "@/lib/empresa/loja";
import { normalizar } from "@/lib/migracao/planilha";
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
  /** várias contas baixadas com a mesma linha (a soma tem que bater, ou aceitar a diferença como juros/desconto) */
  lancamentoIds?: string[] | null; aceitarDiferenca?: boolean;
  /** funcionário que recebeu (pagamento de pessoal): vai para a folha e o painel de mão de obra */
  funcionarioId?: string | null;
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
        const ids = Array.isArray(it.lancamentoIds) && it.lancamentoIds.length ? it.lancamentoIds.map(String) : it.lancamentoId ? [String(it.lancamentoId)] : [];
        if (!ids.length) throw new Error("escolha a conta a baixar");
        await prisma.$transaction((tx) => todasAsLojas(() => conciliarTx(tx, it.transacaoId, ids, { centroCustoId: it.centroCustoId || null, aceitarDiferenca: !!it.aceitarDiferenca })));
        baixadas += ids.length;
      } else if (it.acao === "LANCAR") {
        if (!it.categoriaId) throw new Error("escolha a categoria");
        await prisma.$transaction(async (tx) => {
          const t = await lancarAvulsoTx(tx, it.transacaoId, String(it.categoriaId), it.descricao ? String(it.descricao).slice(0, 300) : undefined, it.centroCustoId || null,
            it.competencia && /^\d{4}-\d{2}-\d{2}$/.test(it.competencia) ? new Date(`${it.competencia}T00:00:00Z`) : null, it.funcionarioId || null);
          // aprende o favorecido → categoria (pagamento de funcionário já tem a regra própria, pela data)
          if (!it.funcionarioId) await aprenderRegra(tx, { descricao: t.descricao, valor: Number(t.valor), categoriaId: String(it.categoriaId), centroCustoId: it.centroCustoId || null });
        });
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

/** Várias linhas do extrato pagam uma conta só: divide a conta numa parte por linha (a soma é conferida). */
export async function juntarLinhas(transacaoIds: string[], lancamentoId: string, opts: { centroCustoId?: string | null; deixarRestante?: boolean } = {}): Promise<Estado> {
  await exigirUsuario(["ADMIN", "GERENTE"]);
  try {
    const r = await prisma.$transaction((tx) => todasAsLojas(() => conciliarLinhasTx(tx, (transacaoIds ?? []).map(String), String(lancamentoId), { centroCustoId: opts.centroCustoId || null, deixarRestante: !!opts.deixarRestante })));
    const brl = (v: number) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
    return feito(`Conta dividida em ${r.partes} partes e baixada com ${transacaoIds.length} linhas do extrato.${r.restante ? ` Ficou em aberto: ${brl(r.restante)}.` : ""}`);
  } catch (e) { return falha(e); }
}

export type ContaAberta = { lancamentoId: string; descricao: string; pessoa: string | null; valor: number; vencimento: string; centroCustoId: string | null };

/**
 * Contas em aberto para escolher à mão (várias contas numa linha, ou várias linhas numa conta). Busca por descrição,
 * nome/fantasia/CPF/CNPJ da pessoa ou valor ("1400", "1.400,00"); sem busca, as de valor mais perto do alvo.
 */
export async function buscarContasAbertas(tipo: "PAGAR" | "RECEBER", busca: string, alvo?: number): Promise<ContaAberta[]> {
  await exigirUsuario(["ADMIN", "GERENTE"]);
  const ls = await todasAsLojas(() => prisma.lancamento.findMany({
    where: { tipo: tipo === "RECEBER" ? "RECEBER" : "PAGAR", pagoEm: null, transferenciaId: null },
    include: { pessoa: { select: { nome: true, fantasia: true, documento: true } } },
    orderBy: { vencimento: "asc" }, take: 3000,
  }));
  const q = normalizar(String(busca ?? "")).trim();
  const num = /^[\d.,\s]+$/.test(String(busca ?? "").trim()) ? Number(String(busca).trim().replace(/\./g, "").replace(",", ".")) : NaN;
  const doc = String(busca ?? "").replace(/\D/g, "");
  const filtradas = !q ? ls : ls.filter((l) => {
    if (Number.isFinite(num) && num > 0 && Math.abs(Number(l.valor) - num) < 0.01) return true;
    if (doc.length >= 5 && l.pessoa?.documento?.includes(doc)) return true;
    return normalizar([l.descricao, l.pessoa?.nome, l.pessoa?.fantasia].filter(Boolean).join(" ")).includes(q);
  });
  const ordenadas = !q && alvo ? [...filtradas].sort((a, b) => Math.abs(Number(a.valor) - alvo) - Math.abs(Number(b.valor) - alvo)) : filtradas;
  return ordenadas.slice(0, 40).map((l) => ({
    lancamentoId: l.id, descricao: l.descricao, pessoa: l.pessoa ? [l.pessoa.nome, l.pessoa.fantasia].filter(Boolean).join(" / ") : null,
    valor: Number(l.valor), vencimento: l.vencimento.toISOString().slice(0, 10), centroCustoId: l.centroCustoId,
  }));
}
