import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";

/** Busca de fornecedores/transportadoras/clientes para os campos "Digite para buscar" (?papel=fornecedor). */
export async function GET(req: Request) {
  const u = new URL(req.url).searchParams;
  const q = (u.get("q") ?? "").trim();
  const papel = u.get("papel");
  if (q.length < 2 || !["cliente", "fornecedor", "transportadora"].includes(papel ?? "")) return NextResponse.json([]);
  const dig = q.replace(/\D/g, "");
  const lista = await prisma.pessoa.findMany({
    where: { [papel!]: true, ativo: true, OR: [{ nome: { contains: q, mode: "insensitive" } }, { fantasia: { contains: q, mode: "insensitive" } }, ...(dig.length >= 3 ? [{ documento: { contains: dig } }] : [])] },
    select: { id: true, nome: true, fantasia: true, documento: true, cidade: true }, orderBy: { nome: "asc" }, take: 15,
  });
  return NextResponse.json(lista);
}
