import { NextResponse } from "next/server";
import { buscarPessoas } from "@/lib/cadastros/buscaPessoas";

/** Busca de clientes para os campos "Digite para buscar" (nome, fantasia, CPF/CNPJ ou telefone), com etiquetas. */
export async function GET(req: Request) {
  return NextResponse.json(await buscarPessoas("cliente", new URL(req.url).searchParams.get("q") ?? ""));
}
