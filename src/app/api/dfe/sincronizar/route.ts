import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { sincronizarDfe } from "@/lib/fiscal/dfe";

/**
 * Chamado pelo agendador de hora em hora: busca na SEFAZ as NF-e emitidas contra o CNPJ da empresa.
 *   curl -X POST -H "Authorization: Bearer $CRON_SECRET" http://localhost:3000/api/dfe/sincronizar
 * Sem empresa cadastrada ou sem certificado, não faz nada.
 */
export async function POST(req: Request) {
  const segredo = process.env.CRON_SECRET;
  if (!segredo || req.headers.get("authorization") !== `Bearer ${segredo}`) return NextResponse.json({ erro: "não autorizado" }, { status: 401 });
  if (!process.env.CERTIFICADO_A1_PATH || !(await prisma.empresa.count())) return NextResponse.json({ ignorado: "sem certificado ou empresa" });
  try {
    return NextResponse.json(await sincronizarDfe());
  } catch (e) {
    return NextResponse.json({ erro: e instanceof Error ? e.message : String(e) }, { status: 500 });
  }
}
