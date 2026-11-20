import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { sincronizarDfeTodas } from "@/lib/fiscal/dfe";

/**
 * Chamado pelo agendador de hora em hora: busca na SEFAZ as NF-e emitidas contra o CNPJ de cada empresa.
 *   curl -X POST -H "Authorization: Bearer $CRON_SECRET" http://localhost:3000/api/dfe/sincronizar
 * Empresa sem certificado é ignorada.
 */
export async function POST(req: Request) {
  const segredo = process.env.CRON_SECRET;
  if (!segredo || req.headers.get("authorization") !== `Bearer ${segredo}`) return NextResponse.json({ erro: "não autorizado" }, { status: 401 });
  if (!(await prisma.empresa.count())) return NextResponse.json({ ignorado: "sem empresa" });
  try {
    return NextResponse.json(await sincronizarDfeTodas());
  } catch (e) {
    return NextResponse.json({ erro: e instanceof Error ? e.message : String(e) }, { status: 500 });
  }
}
