import { NextResponse } from "next/server";
import { sincronizarOpenFinance } from "@/lib/openfinance/openfinance";

/**
 * Chamado pelo agendador de hora em hora: puxa pelo Open Finance (Pluggy) o extrato das contas ligadas a uma conta
 * do ERP e manda para a conciliação bancária (baixa automática do que casar sem dúvida).
 *   curl -X POST -H "Authorization: Bearer $CRON_SECRET" http://localhost:3000/api/openfinance/sincronizar
 */
export async function POST(req: Request) {
  const segredo = process.env.CRON_SECRET;
  if (!segredo || req.headers.get("authorization") !== `Bearer ${segredo}`) return NextResponse.json({ erro: "não autorizado" }, { status: 401 });
  try {
    return NextResponse.json(await sincronizarOpenFinance());
  } catch (e) {
    return NextResponse.json({ erro: e instanceof Error ? e.message : String(e) }, { status: 500 });
  }
}
