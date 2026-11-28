import { gerarDanfePdf } from "@/lib/fiscal/danfePdf";

/** Resposta HTTP com o DANFE (PDF) de uma NF-e recebida de fornecedor; abre no navegador, ?baixar=1 salva o arquivo. */
export async function respostaDanfe(req: Request, xml: string, chave: string | null, cancelada = false) {
  let pdf: Buffer;
  try {
    pdf = await gerarDanfePdf(xml, { aviso: cancelada ? "NOTA CANCELADA" : null, rodape: "DANFE gerado pelo MXERP a partir do XML recebido do fornecedor" });
  } catch (e) {
    return new Response(`Não foi possível gerar o PDF da nota: ${e instanceof Error ? e.message : String(e)}`, { status: 422 });
  }
  const nome = `DANFE-${chave ?? "nota"}.pdf`;
  const baixar = new URL(req.url).searchParams.get("baixar");
  return new Response(new Uint8Array(pdf), {
    headers: { "Content-Type": "application/pdf", "Content-Disposition": `${baixar ? "attachment" : "inline"}; filename="${nome}"`, "Cache-Control": "no-store" },
  });
}
