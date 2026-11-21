import { timingSafeEqual } from "node:crypto";
import { ler } from "@/lib/config";
import { receberWebhook } from "@/lib/inter";

/** Aviso do Inter de boleto pago. O token secreto no endereço impede chamadas de fora; mesmo assim tudo é reconsultado no Inter. */
export async function POST(req: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const s = await ler("inter");
  const ok = !!s?.webhookToken && token.length === s.webhookToken.length && timingSafeEqual(Buffer.from(token), Buffer.from(s.webhookToken));
  if (!ok) return new Response(null, { status: 404 });
  const corpo = await req.json().catch(() => null);
  const n = await receberWebhook(corpo).catch(() => 0);
  return Response.json({ ok: true, n });
}
