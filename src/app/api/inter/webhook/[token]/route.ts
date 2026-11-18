import { timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { receberWebhook } from "@/lib/financeiro/boletos";

/**
 * Webhook de boletos do Banco Inter (cadastrado pela tela de configuração). O endereço leva um token secreto;
 * o conteúdo do aviso não é usado para baixar nada: cada boleto citado é consultado de novo no Inter.
 */
export async function POST(req: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const cfg = await prisma.integracaoInter.findUnique({ where: { id: "inter" }, select: { webhookToken: true } });
  const a = Buffer.from(token);
  const b = Buffer.from(cfg?.webhookToken ?? "");
  if (!cfg?.webhookToken || a.length !== b.length || !timingSafeEqual(a, b)) return NextResponse.json({ erro: "não autorizado" }, { status: 401 });
  let corpo: unknown;
  try { corpo = await req.json(); } catch { return NextResponse.json({ erro: "corpo inválido" }, { status: 400 }); }
  try {
    return NextResponse.json({ atualizados: await receberWebhook(corpo) });
  } catch (e) {
    // erro aqui faz o Inter tentar de novo mais tarde; a consulta de hora em hora também cobre
    return NextResponse.json({ erro: e instanceof Error ? e.message : String(e) }, { status: 502 });
  }
}
