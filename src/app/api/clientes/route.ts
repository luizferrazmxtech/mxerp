import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";

/** Busca de clientes para os campos "Digite para buscar" (nome, fantasia, CPF/CNPJ ou telefone). */
export async function GET(req: Request) {
  const q = (new URL(req.url).searchParams.get("q") ?? "").trim();
  if (q.length < 2) return NextResponse.json([]);
  const dig = q.replace(/\D/g, "");
  const lista = await prisma.pessoa.findMany({
    where: {
      cliente: true,
      ativo: true,
      OR: [
        { nome: { contains: q, mode: "insensitive" } },
        { fantasia: { contains: q, mode: "insensitive" } },
        ...(dig.length >= 3 ? [{ documento: { contains: dig } }, { telefone: { contains: dig } }, { celular: { contains: dig } }] : []),
      ],
    },
    select: { id: true, nome: true, fantasia: true, documento: true, cidade: true },
    orderBy: { nome: "asc" },
    take: 15,
  });
  return NextResponse.json(lista);
}
