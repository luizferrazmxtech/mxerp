"use server";

import { exigirUsuario } from "@/lib/auth/atual";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db";
import { conciliarTx, desfazerTx, ignorarTx, importarExtrato, lancarAvulsoTx, lerExtrato, sugestoes } from "@/lib/financeiro/extrato";
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

export async function confirmarSugestoes(): Promise<Estado> {
  await exigirUsuario(["ADMIN", "GERENTE"]);
  try {
    // só contas a pagar: conta a receber é baixada pelo boleto do Inter ou confirmada uma a uma
    const s = (await sugestoes()).filter((x) => x.tipo === "PAGAR");
    for (const x of s) await prisma.$transaction((tx) => conciliarTx(tx, x.transacaoId, [x.lancamentoId]));
    return feito(`${s.length} contas baixadas`);
  } catch (e) { return falha(e); }
}

export async function conciliar(form: FormData) {
  await exigirUsuario(["ADMIN", "GERENTE"]);
  const ids = form.getAll("lancamentoId").map(String).filter(Boolean);
  await prisma.$transaction((tx) => conciliarTx(tx, str(form.get("transacaoId")), ids));
  feito("");
}

export async function lancarAvulso(form: FormData) {
  await exigirUsuario(["ADMIN", "GERENTE"]);
  await prisma.$transaction((tx) => lancarAvulsoTx(tx, str(form.get("transacaoId")), str(form.get("categoriaId"))));
  feito("");
}

export async function ignorar(form: FormData) {
  await exigirUsuario(["ADMIN", "GERENTE"]);
  await prisma.$transaction((tx) => ignorarTx(tx, str(form.get("transacaoId"))));
  feito("");
}

export async function desfazer(form: FormData) {
  await exigirUsuario(["ADMIN", "GERENTE"]);
  await prisma.$transaction((tx) => desfazerTx(tx, str(form.get("transacaoId"))));
  feito("");
}
