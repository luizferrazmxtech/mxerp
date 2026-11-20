import { Pagina } from "@/components/ui/Pagina";
import { exigirArea } from "@/lib/auth/atual";
import Link from "next/link";
import { prisma } from "@/lib/db";
import { temCertificadoServidor } from "@/lib/fiscal/certificado";
import { lojaAtual, nomeLoja } from "@/lib/empresa/atual";
import { brl, dataHora } from "@/lib/ui/format";
import BotaoAcao from "@/components/BotaoAcao";
import { numerosPendentes } from "@/lib/fiscal/inutilizacao";
import { consultarStatus } from "./actions";

export const dynamic = "force-dynamic";

const COR: Record<string, string> = {
  AUTORIZADA: "bg-emerald-200 text-emerald-900", REJEITADA: "bg-red-200 text-red-900", CANCELADA: "bg-slate-300 text-slate-800",
  DENEGADA: "bg-red-300 text-red-900", INUTILIZADA: "bg-slate-200 text-slate-600", ASSINADA: "bg-amber-200 text-amber-900", ENVIADA: "bg-amber-200 text-amber-900", RASCUNHO: "bg-slate-200",
};

export default async function Fiscal() {
  await exigirArea("/fiscal");
  const [e, notas] = await Promise.all([
    lojaAtual(),
    prisma.notaFiscal.findMany({ orderBy: { createdAt: "desc" }, take: 100 }),
  ]);
  const certOk = !!e?.certificadoValidade || temCertificadoServidor();
  // números rejeitados/pulados que ainda precisam ser inutilizados na SEFAZ
  const pendentes = e
    ? (await Promise.all([numerosPendentes(e, "NFE", e.serieNfe, e.ambienteFiscal), numerosPendentes(e, "NFCE", e.serieNfce, e.ambienteFiscal)]))
        .flat().reduce((s, f) => s + f.fim - f.inicio + 1, 0)
    : 0;
  return (
    <Pagina titulo="Notas fiscais" icone="notas" trilha={[{ rotulo: "Notas fiscais", href: "/fiscal" }, { rotulo: "Listar" }]}>
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <Link href="/fiscal/inutilizacao" className="btn-sec">Inutilizar numeração{pendentes > 0 && <span className="ml-1 rounded bg-red-600 px-1.5 text-[11px] text-white">{pendentes}</span>}</Link>
      </div>
      <div className="grid gap-3 md:grid-cols-3">
        <div className="cartao p-4 text-sm">
          <div className="text-xs text-slate-500">Loja emitente</div>
          <p className="font-semibold uppercase">{e ? nomeLoja(e) : "nenhuma empresa cadastrada"}</p>
          <div className="mt-2 text-xs text-slate-500">Certificado A1</div>
          {e?.certificadoValidade ? <p className="text-emerald-700">Válido até {e.certificadoValidade.toLocaleDateString("pt-BR")}</p>
            : certOk ? <p className="text-slate-700">O do servidor</p> : <p className="text-red-700">Não enviado</p>}
          <div className="mt-2 text-xs text-slate-500">Ambiente NF-e/NFC-e · NFS-e</div>
          <p>
            <span className={e?.ambienteFiscal === "PRODUCAO" ? "font-semibold text-red-700" : "text-amber-700"}>{e?.ambienteFiscal === "PRODUCAO" ? "PRODUÇÃO" : "Homologação"}</span>
            {" · "}
            <span className={e?.ambienteNfse === "PRODUCAO" ? "font-semibold text-red-700" : "text-amber-700"}>{e?.ambienteNfse === "PRODUCAO" ? "PRODUÇÃO" : "Homologação"}</span>
          </p>
          <Link href={e ? `/empresas/${e.id}` : "/empresas/nova"} className="mt-2 inline-block text-[13px] text-marca hover:underline">Configurações fiscais desta loja</Link>
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

    </div>
    </Pagina>
  );
}
