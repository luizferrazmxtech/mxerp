import Link from "next/link";
import { prisma } from "@/lib/db";
import { brl } from "@/lib/ui/format";
import Icone from "@/components/Icone";

/**
 * Faixa "Voltar para a conta a receber" mostrada na venda/OS/compra aberta a partir do financeiro (?conta=id),
 * para voltar à conta específica em vez da lista geral.
 */
export default async function VoltarConta({ contaId }: { contaId?: string }) {
  if (!contaId || !/^[a-z0-9]{10,40}$/i.test(contaId)) return null;
  const l = await prisma.lancamento.findUnique({ where: { id: contaId }, select: { id: true, tipo: true, descricao: true, valor: true, parcela: true, totalParcelas: true } });
  if (!l) return null;
  const nome = l.tipo === "PAGAR" ? "conta a pagar" : "conta a receber";
  return (
    <div className="no-print mb-3 flex flex-wrap items-center gap-2 rounded-md border border-slate-200 bg-white px-3 py-2 text-[13px]">
      <Link href={`/financeiro/lancamentos/${l.id}`} className="btn-sec py-1"><Icone nome="direita" size={14} className="rotate-180" /> Voltar para a {nome}</Link>
      <span className="text-slate-600">{l.descricao}{l.totalParcelas > 1 ? ` · parcela ${l.parcela}/${l.totalParcelas}` : ""} · <b>{brl(l.valor)}</b></span>
    </div>
  );
}
