import QRCode from "qrcode";
import { prisma } from "@/lib/db";

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
const brl = (v: number) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

/**
 * Página do boleto enquanto o Inter ainda registra a parte do código de barras: mostra o QR e o Pix copia e cola
 * (que já valem e baixam a conta do mesmo jeito). `null` se o boleto ainda não tem Pix.
 */
export async function paginaPixBoleto(boletoId: string, aviso: string): Promise<Response | null> {
  const b = await prisma.boleto.findUnique({
    where: { id: boletoId },
    select: { pixCopiaECola: true, valor: true, vencimento: true, lancamento: { select: { descricao: true, pessoa: { select: { nome: true } } } } },
  });
  if (!b?.pixCopiaECola) return null;
  const qr = await QRCode.toDataURL(b.pixCopiaECola, { margin: 1, width: 280 });
  const venc = b.vencimento.toLocaleDateString("pt-BR", { timeZone: "UTC" });
  const html = `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Pagamento por Pix</title>
<style>body{font-family:system-ui,sans-serif;background:#f8fafc;color:#0f172a;margin:0;padding:16px}main{max-width:440px;margin:0 auto;background:#fff;border:1px solid #e2e8f0;border-radius:8px;padding:20px;text-align:center}
h1{font-size:18px;margin:0 0 4px}p{font-size:14px;margin:6px 0}.aviso{background:#fef9c3;border:1px solid #fde047;border-radius:6px;padding:8px;font-size:13px;text-align:left}
textarea{width:100%;box-sizing:border-box;font:12px monospace;height:90px;margin-top:8px}button{margin-top:8px;padding:8px 14px;border:0;border-radius:6px;background:#018e83;color:#fff;font-size:14px;cursor:pointer}@media print{button{display:none}}</style></head>
<body><main><h1>Pague com Pix</h1>
${b.lancamento ? `<p>${esc(b.lancamento.descricao)}${b.lancamento.pessoa ? ` · ${esc(b.lancamento.pessoa.nome)}` : ""}</p>` : ""}
<p><b>${brl(Number(b.valor))}</b> · vencimento ${venc}</p>
<img src="${qr}" alt="QR Code do Pix" width="280" height="280">
<textarea id="pix" readonly>${esc(b.pixCopiaECola)}</textarea>
<button onclick="navigator.clipboard.writeText(document.getElementById('pix').value);this.textContent='Copiado'">Copiar Pix copia e cola</button>
<p class="aviso">${esc(aviso)} O boleto em PDF fica disponível neste mesmo link quando o banco terminar o registro.</p>
</main></body></html>`;
  return new Response(html, { headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "private, no-store" } });
}
