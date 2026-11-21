import { NextResponse } from "next/server";
import { enviarAvisoConciliacao } from "@/lib/financeiro/avisoConciliacao";

/**
 * Agendador (de hora em hora): manda o aviso diário da conciliação pelo WhatsApp, uma vez por dia, a partir da hora
 * escolhida em Financeiro › Conciliação › Regras e aviso diário. Desligado, não faz nada.
 *   curl -X POST -H "Authorization: Bearer $CRON_SECRET" http://localhost:3000/api/conciliacao/aviso
 */
export async function POST(req: Request) {
  const segredo = process.env.CRON_SECRET;
  if (!segredo || req.headers.get("authorization") !== `Bearer ${segredo}`) return NextResponse.json({ erro: "não autorizado" }, { status: 401 });
  try {
    return NextResponse.json(await enviarAvisoConciliacao());
  } catch (e) {
    return NextResponse.json({ erro: e instanceof Error ? e.message : String(e) }, { status: 500 });
  }
}
