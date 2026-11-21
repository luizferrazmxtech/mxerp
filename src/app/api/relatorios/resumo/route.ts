import { NextResponse } from "next/server";
import { enviarResumoSemanal } from "@/lib/relatorios/resumoSemanal";

/**
 * Agendador (de hora em hora): manda o resumo semanal dos relatórios pelo WhatsApp no dia e hora escolhidos em
 * Relatórios › Resumo no WhatsApp. Desligado, não faz nada.
 *   curl -X POST -H "Authorization: Bearer $CRON_SECRET" http://localhost:3000/api/relatorios/resumo
 */
export async function POST(req: Request) {
  const segredo = process.env.CRON_SECRET;
  if (!segredo || req.headers.get("authorization") !== `Bearer ${segredo}`) return NextResponse.json({ erro: "não autorizado" }, { status: 401 });
  try {
    const r = await enviarResumoSemanal();
    return NextResponse.json({ enviado: r.enviado, erros: r.erros, motivo: r.motivo });
  } catch (e) {
    return NextResponse.json({ erro: e instanceof Error ? e.message : String(e) }, { status: 500 });
  }
}
