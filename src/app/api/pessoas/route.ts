import { NextResponse } from "next/server";
import { buscarPessoas, type PapelBusca } from "@/lib/cadastros/buscaPessoas";

/** Busca de clientes/fornecedores/transportadoras para os campos "Digite para buscar" (?papel=cliente), com etiquetas. */
export async function GET(req: Request) {
  const u = new URL(req.url).searchParams;
  const papel = u.get("papel");
  if (!["cliente", "fornecedor", "transportadora"].includes(papel ?? "")) return NextResponse.json([]);
  return NextResponse.json(await buscarPessoas(papel as PapelBusca, u.get("q") ?? ""));
}
