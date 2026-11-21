import { NextResponse } from "next/server";
import { processarContador } from "@/lib/contador/contador";

/**
 * Agendador (de hora em hora): a partir do dia configurado, manda ao contador os XMLs do mês anterior.
 *   curl -X POST -H "Authorization: Bearer $CRON_SECRET" http://localhost:3000/api/contador/processar
 */
export async function POST(req: Request) {
  const segredo = process.env.CRON_SECRET;
  if (!segredo || req.headers.get("authorization") !== `Bearer ${segredo}`) return NextResponse.json({ erro: "não autorizado" }, { status: 401 });
  try {
    return NextResponse.json(await processarContador());
  } catch (e) {
    return NextResponse.json({ erro: e instanceof Error ? e.message : String(e) }, { status: 500 });
  }
}
