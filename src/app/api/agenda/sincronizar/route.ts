import { NextResponse } from "next/server";
import { sincronizarAgenda } from "@/lib/agenda/google";

/**
 * Chamado pelo agendador de hora em hora: tenta de novo levar ao Google Agenda as OS cuja última tentativa falhou.
 *   curl -X POST -H "Authorization: Bearer $CRON_SECRET" http://localhost:3000/api/agenda/sincronizar
 */
export async function POST(req: Request) {
  const segredo = process.env.CRON_SECRET;
  if (!segredo || req.headers.get("authorization") !== `Bearer ${segredo}`) return NextResponse.json({ erro: "não autorizado" }, { status: 401 });
  try {
    return NextResponse.json(await sincronizarAgenda());
  } catch (e) {
    return NextResponse.json({ erro: e instanceof Error ? e.message : String(e) }, { status: 500 });
  }
}
