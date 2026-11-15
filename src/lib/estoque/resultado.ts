import { prisma } from "@/lib/db";
import type { Alocacao } from "./alocacao";

/** Monta a mensagem "Pegar: 2 em A-01 · 1 em B-02" a partir das alocações. */
export async function resultadoReserva(alocacoes: Alocacao[]) {
  if (!alocacoes.length) return { ok: true, mensagem: "Item adicionado." };
  const locais = await prisma.local.findMany({
    where: { id: { in: alocacoes.map((a) => a.localId).filter((x): x is string => !!x) } },
  });
  const cod = new Map(locais.map((l) => [l.id, l.codigo]));
  const pegar = alocacoes.map((a) => ({ local: a.localId ? cod.get(a.localId)! : "EM FALTA", quantidade: a.quantidade }));
  const falta = alocacoes.find((a) => !a.localId);
  return {
    ok: !falta,
    mensagem: falta ? `Reservado, mas faltam ${falta.quantidade} no estoque.` : "Reservado no estoque.",
    pegar,
  };
}
