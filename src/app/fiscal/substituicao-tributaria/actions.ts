"use server";

import { revalidatePath } from "next/cache";
import { exigirUsuario } from "@/lib/auth/atual";
import { registrarAuditoria } from "@/lib/auditoria/registro";
import { aplicarSt, removerSt } from "@/lib/fiscal/st";

export type Res = { ok: boolean; mensagem: string } | null;

/** Aplica (ou desfaz) a regra de ST nos produtos marcados na lista. */
export async function acaoSt(_: Res, form: FormData): Promise<Res> {
  const u = await exigirUsuario(["ADMIN", "GERENTE"]);
  try {
    const ids = form.getAll("produto").map(String).filter(Boolean);
    if (!ids.length) throw new Error("Marque pelo menos um produto");
    if (form.get("acao") === "remover") {
      const n = await removerSt(ids);
      await registrarAuditoria(u, { entidade: "Produto", acao: "ALTERAR", descricao: `Regra de ST removida de ${n} produto(s) em lote` });
      revalidatePath("/fiscal/substituicao-tributaria");
      return { ok: true, mensagem: `${n} produto(s) voltaram para a regra padrão da empresa.` };
    }
    const completar: Record<string, { ncm?: string; cest?: string }> = {};
    if (form.get("completar") === "1") {
      for (const id of ids) {
        const ncm = String(form.get(`ncm_${id}`) ?? "").replace(/\D/g, ""), cest = String(form.get(`cest_${id}`) ?? "").replace(/\D/g, "");
        if (ncm.length === 8 || cest.length === 7) completar[id] = { ...(ncm.length === 8 ? { ncm } : {}), ...(cest.length === 7 ? { cest } : {}) };
      }
    }
    const n = await aplicarSt(ids, completar);
    await registrarAuditoria(u, { entidade: "Produto", acao: "ALTERAR", descricao: `ST aplicada em lote (CFOP 5405/6404, CSOSN 500, CST 60) em ${n} produto(s)` });
    revalidatePath("/fiscal/substituicao-tributaria");
    return { ok: true, mensagem: `${n} produto(s) agora saem com CFOP 5405 (6404 fora do estado) e CSOSN 500.` };
  } catch (err) {
    return { ok: false, mensagem: err instanceof Error ? err.message : "Erro inesperado" };
  }
}
