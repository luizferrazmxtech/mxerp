import { NextResponse } from "next/server";
import { processarContratos } from "@/lib/contratos/contratos";

/**
 * Chamado pelo agendador do servidor de hora em hora (8h às 20h):
 *   curl -X POST -H "Authorization: Bearer $CRON_SECRET" http://localhost:3000/api/contratos/processar
 * Gera as cobranças dos contratos que chegaram no prazo (venda + boleto + NFS-e) e manda os e-mails de cobrança
 * e lembrete. Pode rodar várias vezes: só faz o que falta.
 */
export async function POST(req: Request) {
  const segredo = process.env.CRON_SECRET;
  if (!segredo || req.headers.get("authorization") !== `Bearer ${segredo}`) return NextResponse.json({ erro: "não autorizado" }, { status: 401 });
  try {
    return NextResponse.json(await processarContratos());
  } catch (e) {
    return NextResponse.json({ erro: e instanceof Error ? e.message : String(e) }, { status: 500 });
  }
}
