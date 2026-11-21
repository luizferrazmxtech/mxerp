import { NextResponse } from "next/server";
import { sincronizarFrete } from "@/lib/frete/melhorEnvio";

/**
 * Chamado pelo agendador de hora em hora: atualiza o rastreio das etiquetas do Melhor Envio em andamento.
 *   curl -X POST -H "Authorization: Bearer $CRON_SECRET" http://localhost:3000/api/frete/sincronizar
 * Sem o frete ligado, a chamada é ignorada.
 */
export async function POST(req: Request) {
  const segredo = process.env.CRON_SECRET;
  if (!segredo || req.headers.get("authorization") !== `Bearer ${segredo}`) return NextResponse.json({ erro: "não autorizado" }, { status: 401 });
  try {
    return NextResponse.json(await sincronizarFrete());
  } catch (e) {
    return NextResponse.json({ erro: e instanceof Error ? e.message : String(e) }, { status: 500 });
  }
}
