import { NextResponse } from "next/server";
import { usuarioAtual } from "@/lib/auth/atual";
import { compraDoXml } from "@/lib/compras/xml";
import { prisma } from "@/lib/db";
import { podeAcessar } from "@/lib/auth/permissoes";

/** Importar XML: recebe a NF-e do fornecedor e devolve a compra montada para o formulário. */
export async function POST(req: Request) {
  const u = await usuarioAtual();
  if (!u) return NextResponse.json({ erro: "não autorizado" }, { status: 401 });
  const form = await req.formData();
  // nota de compra baixada da SEFAZ (Compras › Notas recebidas)
  const recebidaId = form.get("recebidaId");
  if (typeof recebidaId === "string" && recebidaId) {
    if (!podeAcessar(u.papel, "/compras/notas-recebidas")) return NextResponse.json({ erro: "sem permissão" }, { status: 403 });
    const n = await prisma.notaRecebida.findUnique({ where: { id: recebidaId } });
    if (!n?.xml) return NextResponse.json({ erro: "O XML completo desta nota ainda não foi baixado da SEFAZ" }, { status: 400 });
    try {
      return NextResponse.json(await compraDoXml(n.xml));
    } catch (e) {
      return NextResponse.json({ erro: e instanceof Error ? e.message : String(e) }, { status: 400 });
    }
  }
  const arq = form.get("xml");
  if (!(arq instanceof File) || !arq.size) return NextResponse.json({ erro: "Escolha o arquivo XML da nota" }, { status: 400 });
  if (arq.size > 2 * 1024 * 1024) return NextResponse.json({ erro: "O XML passa de 2 MB" }, { status: 400 });
  try {
    return NextResponse.json(await compraDoXml(await arq.text()));
  } catch (e) {
    return NextResponse.json({ erro: e instanceof Error ? e.message : String(e) }, { status: 400 });
  }
}
