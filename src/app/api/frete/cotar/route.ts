import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { usuarioAtual } from "@/lib/auth/atual";
import { lojaAtual } from "@/lib/empresa/atual";
import { cotarFrete, cotarVenda } from "@/lib/frete/melhorEnvio";
import type { ItemCotacao } from "@/lib/frete/tipos";

/**
 * "Cotar frete" do formulário de venda/orçamento: CEP do endereço de entrega escolhido (ou do principal do cliente)
 * ou um CEP digitado, com os produtos da tela.
 */
export async function POST(req: Request) {
  if (!(await usuarioAtual())) return NextResponse.json({ erro: "Entre no sistema" }, { status: 401 });
  const b = (await req.json().catch(() => ({}))) as { vendaId?: string; clienteId?: string; enderecoEntregaId?: string; cep?: string; itens?: ItemCotacao[] };
  if (b.vendaId) {
    try { return NextResponse.json({ cotacoes: await cotarVenda(b.vendaId) }); } catch (e) { return NextResponse.json({ erro: e instanceof Error ? e.message : String(e) }, { status: 400 }); }
  }
  let cep = (b.cep ?? "").replace(/\D/g, "");
  if (!cep && b.enderecoEntregaId) cep = ((await prisma.pessoaEndereco.findUnique({ where: { id: b.enderecoEntregaId } }))?.cep ?? "").replace(/\D/g, "");
  if (!cep && b.clienteId) {
    const p = await prisma.pessoa.findUnique({ where: { id: b.clienteId }, include: { enderecos: { orderBy: { ordem: "asc" }, take: 1 } } });
    cep = (p?.cep || p?.enderecos[0]?.cep || "").replace(/\D/g, "");
  }
  if (!cep) return NextResponse.json({ erro: "Escolha um cliente com CEP no cadastro ou digite o CEP de entrega" }, { status: 400 });
  try {
    const itens = (b.itens ?? []).filter((i) => i.produtoId && Number(i.quantidade) > 0).map((i) => ({ produtoId: String(i.produtoId), quantidade: Number(i.quantidade), valor: Number(i.valor) || 0 }));
    return NextResponse.json({ cep, cotacoes: await cotarFrete({ cepDestino: cep, itens, empresaId: (await lojaAtual())?.id }) });
  } catch (e) {
    return NextResponse.json({ erro: e instanceof Error ? e.message : String(e) }, { status: 400 });
  }
}
