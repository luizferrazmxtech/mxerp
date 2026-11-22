import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { idsInter, sincronizarInter } from "@/lib/financeiro/inter";
import { naLoja } from "@/lib/empresa/loja";
import { sincronizarBoletos } from "@/lib/financeiro/boletos";

/**
 * Chamado pelo agendador do servidor (cron) de hora em hora:
 *   curl -X POST -H "Authorization: Bearer $CRON_SECRET" http://localhost:3000/api/inter/sincronizar
 * 1) boletos: baixa as contas a receber cujos boletos foram pagos, completa/cancela/emite o que faltou;
 * 2) extrato: puxa o extrato e baixa as contas a pagar que casam.
 * Sem integração configurada (ou com a busca automática desligada na tela), não faz nada.
 */
export async function POST(req: Request) {
  const segredo = process.env.CRON_SECRET;
  if (!segredo || req.headers.get("authorization") !== `Bearer ${segredo}`) return NextResponse.json({ erro: "não autorizado" }, { status: 401 });
  // uma rodada por conta do Inter (uma por empresa)
  const ids = await idsInter();
  if (!ids.length) return NextResponse.json({ ignorado: "integração com o Inter não configurada" });
  const contas: Record<string, unknown>[] = [];
  let falhou = false;
  for (const id of ids) {
    const tela = await prisma.integracaoInter.findUnique({ where: { id }, select: { sincronizarAuto: true, empresaId: true } });
    if (tela && !tela.sincronizarAuto) { contas.push({ id, ignorado: "busca automática desligada" }); continue; }
    // dentro da empresa dona da conta: o extrato só casa com os lançamentos e o plano de contas dela
    const naEmpresa = <T,>(fn: () => Promise<T>) => naLoja(tela?.empresaId ?? null, fn);
    const boletos = await naEmpresa(() => sincronizarBoletos({ dias: 5, interId: id })).catch((e) => ({ erro: e instanceof Error ? e.message : String(e) }));
    try {
      contas.push({ id, ...(await naEmpresa(() => sincronizarInter({ dias: 5, interId: id }))), boletos });
    } catch (e) {
      falhou = true;
      contas.push({ id, erro: e instanceof Error ? e.message : String(e), boletos });
    }
  }
  return NextResponse.json(ids.length === 1 ? contas[0] : { contas }, { status: falhou ? 502 : 200 });
}
