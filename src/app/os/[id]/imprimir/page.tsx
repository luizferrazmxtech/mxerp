import Link from "next/link";
import DocumentoOs, { type ModoImpressao } from "@/components/os/DocumentoOs";
import BotaoImprimir from "@/components/orcamentos/BotaoImprimir";
import { tituloOs } from "@/lib/documentos/nomeArquivo";
import { usuarioAtual } from "@/lib/auth/atual";
import { pode } from "@/lib/auth/permissoesAcao";

export const dynamic = "force-dynamic";
export async function generateMetadata({ params }: { params: Promise<{ id: string }> }) { return tituloOs({ id: (await params).id }); }

/** OS para imprimir ou salvar em PDF, com o cabeçalho da MXTECH. A versão do cliente é a única que pode ser enviada. */
export default async function ImprimirOs({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ modo?: string }> }) {
  const [{ id }, sp] = await Promise.all([params, searchParams]);
  const eu = await usuarioAtual();
  // a impressão administrativa (histórico, trechos de mão de obra, observação interna) é só para quem tem a permissão
  const admin = !!eu && (await pode(eu.papel, "os.imprimirAdministrativa"));
  const modo: ModoImpressao = admin && (sp.modo === "completa" || sp.modo === "historico") ? sp.modo : "simples";
  const opcoes: [ModoImpressao, string, string][] = [["simples", "OS do cliente", ""], ...(admin ? [["completa", "Administrativa", "?modo=completa"], ["historico", "Administrativa com histórico", "?modo=historico"]] as [ModoImpressao, string, string][] : [])];
  return (
    <div className="bg-white">
      <div className="no-print mx-auto mb-4 flex max-w-[820px] gap-2 p-6 pb-0"><Link href={`/os/${id}`} className="btn-sec">Voltar</Link>
        <div className="ml-auto flex overflow-hidden rounded border border-slate-300 text-[13px]">
          {opcoes.map(([m, rotulo, q]) => <Link key={m} href={`/os/${id}/imprimir${q}`} className={`px-3 py-1.5 ${m === modo ? "bg-marca text-white" : "bg-white hover:bg-slate-100"}`}>{rotulo}</Link>)}
        </div>
        <BotaoImprimir /></div>
      <DocumentoOs id={id} modo={modo} />
    </div>
  );
}
