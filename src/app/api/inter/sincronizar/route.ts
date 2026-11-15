import { NextResponse } from "next/server";
import { sincronizarInter } from "@/lib/financeiro/inter";

/**
 * Chamado pelo agendador do servidor (cron) para puxar o extrato do Inter, por exemplo a cada hora:
 *   curl -X POST -H "Authorization: Bearer $CRON_SECRET" http://localhost:3000/api/inter/sincronizar
 */
export async function POST(req: Request) {
  const segredo = process.env.CRON_SECRET;
  if (!segredo || req.headers.get("authorization") !== `Bearer ${segredo}`) return NextResponse.json({ erro: "não autorizado" }, { status: 401 });
  try {
    return NextResponse.json(await sincronizarInter({ dias: 5 }));
  } catch (e) {
    return NextResponse.json({ erro: e instanceof Error ? e.message : String(e) }, { status: 502 });
  }
}
