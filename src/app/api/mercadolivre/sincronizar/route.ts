import { NextResponse } from "next/server";
import { sincronizarMercadoLivre } from "@/lib/marketplaces/mercadolivre";

/**
 * Chamado pelo agendador do servidor de hora em hora:
 *   curl -X POST -H "Authorization: Bearer $CRON_SECRET" http://localhost:3000/api/mercadolivre/sincronizar
 * Busca os pedidos novos/alterados do Mercado Livre, gera as vendas e baixa o que o Mercado Pago liberou.
 * Sem conta conectada (ou com a busca automática desligada na tela), não faz nada.
 */
export async function POST(req: Request) {
  const segredo = process.env.CRON_SECRET;
  if (!segredo || req.headers.get("authorization") !== `Bearer ${segredo}`) return NextResponse.json({ erro: "não autorizado" }, { status: 401 });
  try {
    return NextResponse.json(await sincronizarMercadoLivre({ auto: true }));
  } catch (e) {
    return NextResponse.json({ erro: e instanceof Error ? e.message : String(e) }, { status: 502 });
  }
}
