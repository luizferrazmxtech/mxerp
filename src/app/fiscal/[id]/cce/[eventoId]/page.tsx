import { notFound } from "next/navigation";
import { prisma } from "@/lib/db";
import { dataHora } from "@/lib/ui/format";
import { CONDICAO_USO_CCE } from "@/lib/fiscal/sefaz";
import BotaoImprimir from "@/app/os/[id]/separacao/BotaoImprimir";

export const dynamic = "force-dynamic";

/** Impressão da carta de correção (o "DACCe"), para acompanhar a DANFE. */
export default async function Cce({ params }: { params: Promise<{ id: string; eventoId: string }> }) {
  const { id, eventoId } = await params;
  const ev = await prisma.notaEvento.findFirst({ where: { id: eventoId, notaId: id, tipo: "110110" }, include: { nota: true } });
  if (!ev) notFound();
  const e = await prisma.empresa.findFirst();
  return (
    <div className="mx-auto max-w-2xl space-y-3 bg-white p-6 text-sm">
      <div className="no-print flex justify-end"><BotaoImprimir /></div>
      <h1 className="text-center text-lg font-semibold">Carta de Correção Eletrônica</h1>
      {ev.nota.ambiente === "HOMOLOGACAO" && <p className="text-center text-xs font-bold text-red-700">EMITIDA EM HOMOLOGAÇÃO · SEM VALOR FISCAL</p>}
      <div className="rounded border p-3">
        <div className="font-medium">{e?.razaoSocial}</div>
        <div className="text-xs">CNPJ {e?.cnpj} · IE {e?.inscricaoEstadual}</div>
      </div>
      <div className="grid grid-cols-2 gap-2 rounded border p-3 text-xs">
        <div>NF-e nº <b>{ev.nota.numero}</b> série {ev.nota.serie}</div>
        <div>Sequência da correção: <b>{ev.sequencia}</b></div>
        <div className="col-span-2 break-all font-mono">Chave {ev.nota.chave}</div>
        <div>Registrada em {dataHora(ev.createdAt)}</div>
        <div>Protocolo {ev.protocolo}</div>
      </div>
      <div className="rounded border p-3"><div className="mb-1 text-xs text-slate-500">Correção</div><p className="whitespace-pre-wrap">{ev.texto}</p></div>
      <p className="text-[11px] text-slate-500">{CONDICAO_USO_CCE}</p>
    </div>
  );
}
