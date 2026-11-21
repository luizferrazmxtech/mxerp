import { NextResponse, after } from "next/server";
import { receberNotificacaoML } from "@/lib/marketplaces/mercadolivre";

/**
 * Notificações do Mercado Livre (URL cadastrada no aplicativo, tópico "Orders"). O endereço leva um token secreto.
 * O Mercado Livre espera resposta em até 500 ms: respondemos logo e processamos o pedido em seguida.
 * O aviso em si não é usado para nada além do número do pedido, que é consultado de novo na API.
 */
export async function POST(req: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  let corpo: { topic?: string; resource?: string; user_id?: number | string };
  try { corpo = await req.json(); } catch { return NextResponse.json({ erro: "corpo inválido" }, { status: 400 }); }
  after(async () => {
    try { await receberNotificacaoML(token, corpo); } catch (e) { console.error("Notificação do Mercado Livre:", e instanceof Error ? e.message : e); }
  });
  return NextResponse.json({ ok: true });
}
