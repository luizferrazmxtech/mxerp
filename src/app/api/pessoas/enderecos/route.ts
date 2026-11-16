import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";

/** Endereços de uma pessoa (endereço de entrega do orçamento/venda). */
export async function GET(req: Request) {
  const id = new URL(req.url).searchParams.get("pessoa") ?? "";
  if (!id) return NextResponse.json([]);
  const l = await prisma.pessoaEndereco.findMany({ where: { pessoaId: id }, orderBy: { ordem: "asc" } });
  return NextResponse.json(l.map((e) => ({ id: e.id, texto: [e.tipo, `${e.logradouro ?? ""}, ${e.numero ?? ""}`, e.bairro, `${e.cidade ?? ""}/${e.uf ?? ""}`].filter(Boolean).join(" · ") })));
}
