"use server";

import { revalidatePath } from "next/cache";
import type { PapelUsuario } from "@prisma/client";
import { exigirUsuario } from "@/lib/auth/atual";
import { prisma } from "@/lib/db";
import { atualizarBoleto, cancelarBoleto, emitirBoleto, ROTULO_BOLETO } from "./boletos";

const VENDE: PapelUsuario[] = ["ADMIN", "GERENTE", "OPERADOR", "CAIXA"];
const msg = (e: unknown) => ({ ok: false, mensagem: e instanceof Error ? e.message : String(e) });
function revalidar() {
  revalidatePath("/vendas", "layout");
  revalidatePath("/os", "layout");
  revalidatePath("/financeiro");
}

/** Emite (ou emite de novo, depois de um erro/cancelamento) o boleto da parcela. */
export async function emitirBoletoAcao(lancamentoId: string) {
  await exigirUsuario(VENDE);
  try {
    // um boleto com erro é encerrado antes de tentar de novo
    await prisma.boleto.updateMany({ where: { lancamentoId, situacao: "ERRO" }, data: { situacao: "CANCELADO" } });
    const b = await emitirBoleto(lancamentoId);
    revalidar();
    return { ok: true, mensagem: `${ROTULO_BOLETO[b.situacao] ?? b.situacao} (nº ${b.seuNumero}).` };
  } catch (e) { revalidar(); return msg(e); }
}

export async function atualizarBoletoAcao(boletoId: string) {
  await exigirUsuario(VENDE);
  try {
    const b = await atualizarBoleto(boletoId);
    revalidar();
    return { ok: true, mensagem: ROTULO_BOLETO[b.situacao] ?? b.situacao };
  } catch (e) { return msg(e); }
}

export async function cancelarBoletoAcao(boletoId: string) {
  await exigirUsuario(["ADMIN", "GERENTE"]);
  try {
    const b = await cancelarBoleto(boletoId, "Cancelado pelo usuário no ERP");
    revalidar();
    return { ok: true, mensagem: ROTULO_BOLETO[b!.situacao] ?? b!.situacao };
  } catch (e) { return msg(e); }
}
