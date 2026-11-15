import Link from "next/link";
import { prisma } from "@/lib/db";
import { brl, dataHora } from "@/lib/ui/format";
import BotaoAcao from "@/components/BotaoAcao";
import ConfigEmpresa from "./ConfigEmpresa";
import { consultarStatus } from "./actions";

export const dynamic = "force-dynamic";

const COR: Record<string, string> = {
  AUTORIZADA: "bg-emerald-200 text-emerald-900", REJEITADA: "bg-red-200 text-red-900", CANCELADA: "bg-slate-300 text-slate-800",
  DENEGADA: "bg-red-300 text-red-900", ASSINADA: "bg-amber-200 text-amber-900", RASCUNHO: "bg-slate-200",
};

export default async function Fiscal() {
  const [e, notas] = await Promise.all([
    prisma.empresa.findFirst(),
    prisma.notaFiscal.findMany({ orderBy: { createdAt: "desc" }, take: 100 }),
  ]);
  const certOk = !!process.env.CERTIFICADO_A1_PATH;
  return (
    <div className="space-y-4">
      <h1 className="text-xl font-semibold">Notas fiscais</h1>
      <div className="grid gap-3 md:grid-cols-3">
        <div className="cartao p-4 text-sm">
          <div className="text-xs text-slate-500">Certificado A1</div>
          {certOk ? <p className="text-emerald-700">Configurado no servidor</p> : (
            <p className="text-red-700">Não configurado. Defina CERTIFICADO_A1_PATH e CERTIFICADO_A1_SENHA no servidor.</p>
          )}
          <div className="mt-2 text-xs text-slate-500">Ambiente</div>
          <p className={e?.ambienteFiscal === "PRODUCAO" ? "font-semibold text-red-700" : "text-amber-700"}>
            {e?.ambienteFiscal === "PRODUCAO" ? "PRODUÇÃO (valor fiscal)" : "Homologação (testes)"}
          </p>
        </div>
        <div className="cartao p-4"><BotaoAcao acao={consultarStatus} campos={{ modelo: "55" }} rotulo="Status SEFAZ NF-e" secundario /></div>
        <div className="cartao p-4"><BotaoAcao acao={consultarStatus} campos={{ modelo: "65" }} rotulo="Status SEFAZ NFC-e" secundario /></div>
      </div>

      <div className="cartao overflow-x-auto">
        <table className="tabela">
          <thead><tr><th>Modelo</th><th>Série/Nº</th><th>Situação</th><th>Emissão</th><th className="text-right">Valor</th><th>Retorno SEFAZ</th></tr></thead>
          <tbody>
            {notas.map((n) => (
              <tr key={n.id}>
                <td>{n.modelo === "NFE" ? "NF-e" : n.modelo === "NFCE" ? "NFC-e" : "NFS-e"}{n.ambiente === "HOMOLOGACAO" && <span className="ml-1 text-xs text-amber-700">homolog.</span>}</td>
                <td><Link href={`/fiscal/${n.id}`} className="text-marca hover:underline">{n.serie}/{n.numero}</Link></td>
                <td><span className={`rounded px-2 py-0.5 text-xs ${COR[n.status]}`}>{n.status.toLowerCase()}</span></td>
                <td>{dataHora(n.emitidaEm ?? n.createdAt)}</td>
                <td className="text-right">{brl(n.valorTotal)}</td>
                <td className="max-w-md truncate text-xs text-slate-600" title={n.motivo ?? ""}>{n.motivo}</td>
              </tr>
            ))}
            {!notas.length && <tr><td colSpan={6} className="py-8 text-center text-slate-500">Nenhuma nota emitida. Emita pela venda ou pela OS.</td></tr>}
          </tbody>
        </table>
      </div>

      <ConfigEmpresa e={e} />
    </div>
  );
}
