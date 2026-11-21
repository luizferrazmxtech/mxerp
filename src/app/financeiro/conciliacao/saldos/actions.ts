"use server";

import { revalidatePath } from "next/cache";
import { exigirUsuario } from "@/lib/auth/atual";
import { registrarSaldo } from "@/lib/financeiro/saldos";
import type { Resultado } from "@/components/financeiro/FormAcao";

/** Saldo que o banco mostra num dia (digitado do app/extrato do banco). */
export async function informarSaldoAcao(_: Resultado, form: FormData): Promise<Resultado> {
  await exigirUsuario(["ADMIN", "GERENTE"]);
  try {
    const conta = String(form.get("contaBancariaId") ?? "");
    const data = String(form.get("data") ?? "");
    const bruto = String(form.get("saldo") ?? "").trim();
    if (!conta) throw new Error("Escolha a conta");
    if (!/^\d{4}-\d{2}-\d{2}$/.test(data)) throw new Error("Informe a data");
    const negativo = bruto.startsWith("-");
    const v = Number(bruto.replace(/[^\d,.]/g, "").replace(/\.(?=\d{3}(\D|$))/g, "").replace(",", "."));
    if (!bruto || !Number.isFinite(v)) throw new Error("Informe o saldo (ex.: 12.345,67)");
    await registrarSaldo(conta, new Date(`${data}T00:00:00Z`), negativo ? -v : v, "MANUAL");
    revalidatePath("/financeiro/conciliacao/saldos");
    return { ok: true, mensagem: "Saldo do banco gravado" };
  } catch (e) { return { ok: false, mensagem: e instanceof Error ? e.message : String(e) }; }
}
