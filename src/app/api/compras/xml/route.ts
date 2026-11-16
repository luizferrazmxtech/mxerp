import { NextResponse } from "next/server";
import { usuarioAtual } from "@/lib/auth/atual";
import { compraDoXml } from "@/lib/compras/xml";

/** Importar XML: recebe a NF-e do fornecedor e devolve a compra montada para o formulário. */
export async function POST(req: Request) {
  if (!(await usuarioAtual())) return NextResponse.json({ erro: "não autorizado" }, { status: 401 });
  const form = await req.formData();
  const arq = form.get("xml");
  if (!(arq instanceof File) || !arq.size) return NextResponse.json({ erro: "Escolha o arquivo XML da nota" }, { status: 400 });
  if (arq.size > 2 * 1024 * 1024) return NextResponse.json({ erro: "O XML passa de 2 MB" }, { status: 400 });
  try {
    return NextResponse.json(await compraDoXml(await arq.text()));
  } catch (e) {
    return NextResponse.json({ erro: e instanceof Error ? e.message : String(e) }, { status: 400 });
  }
}
