import { NextResponse } from "next/server";
import { saldoDetalhado } from "@/lib/estoque/carro";

/** Saldo de um produto para a dica da quantidade (OS, venda, orçamento): físico, reservado, disponível e onde está. */
export async function GET(req: Request) {
  const id = new URL(req.url).searchParams.get("produto") ?? "";
  if (!id) return NextResponse.json({ erro: "informe o produto" }, { status: 400 });
  const s = await saldoDetalhado(id);
  return s ? NextResponse.json(s) : NextResponse.json({ erro: "produto não encontrado" }, { status: 404 });
}
