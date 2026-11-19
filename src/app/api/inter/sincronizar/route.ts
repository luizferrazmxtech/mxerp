import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { interConfigurado, sincronizarInter } from "@/lib/financeiro/inter";
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
  if (!(await interConfigurado())) return NextResponse.json({ ignorado: "integração com o Inter não configurada" });
  const tela = await prisma.integracaoInter.findUnique({ where: { id: "inter" }, select: { sincronizarAuto: true } });
  if (tela && !tela.sincronizarAuto) return NextResponse.json({ ignorado: "busca automática desligada" });
  const boletos = await sincronizarBoletos({ dias: 5 }).catch((e) => ({ erro: e instanceof Error ? e.message : String(e) }));
  try {
    return NextResponse.json({ ...(await sincronizarInter({ dias: 5 })), boletos });
  } catch (e) {
    return NextResponse.json({ erro: e instanceof Error ? e.message : String(e), boletos }, { status: 502 });
  }
}
