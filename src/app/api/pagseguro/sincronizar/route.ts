import { NextResponse } from "next/server";
import { sincronizarPagSeguro } from "@/lib/pagseguro/pagseguro";

/**
 * Chamado pelo agendador de hora em hora: lê no EDI do PagSeguro as vendas da maquininha/PIX e os repasses dos
 * últimos dias e concilia com as contas a receber (taxa e data do repasse). Sem o EDI ligado, só vence PIX velhos.
 *   curl -X POST -H "Authorization: Bearer $CRON_SECRET" http://localhost:3000/api/pagseguro/sincronizar
 */
export async function POST(req: Request) {
  const segredo = process.env.CRON_SECRET;
  if (!segredo || req.headers.get("authorization") !== `Bearer ${segredo}`) return NextResponse.json({ erro: "não autorizado" }, { status: 401 });
  try {
    return NextResponse.json(await sincronizarPagSeguro());
  } catch (e) {
    return NextResponse.json({ erro: e instanceof Error ? e.message : String(e) }, { status: 500 });
  }
}
