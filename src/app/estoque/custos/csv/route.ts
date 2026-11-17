import { NextResponse } from "next/server";
import { usuarioAtual } from "@/lib/auth/atual";
import { csvCustos } from "@/lib/estoque/custos";

/** Exporta o relatório de custos (a visão aberta, com os mesmos filtros) em CSV para o Excel. */
export async function GET(req: Request) {
  const u = await usuarioAtual();
  if (!u || !["ADMIN", "GERENTE"].includes(u.papel)) return NextResponse.json({ erro: "Sem permissão" }, { status: 403 });
  const sp = Object.fromEntries(new URL(req.url).searchParams);
  const csv = await csvCustos(sp);
  return new NextResponse(csv, { headers: { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": `attachment; filename="custos-${sp.visao || "produtos"}.csv"` } });
}
