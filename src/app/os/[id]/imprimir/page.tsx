import Link from "next/link";
import DocumentoOs, { type ModoImpressao } from "@/components/os/DocumentoOs";
import BotaoImprimir from "@/components/orcamentos/BotaoImprimir";

export const dynamic = "force-dynamic";
export const metadata = { title: "Imprimir OS" };

/** OS para imprimir ou salvar em PDF, com o cabeçalho da MXTECH. */
export default async function ImprimirOs({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ modo?: string }> }) {
  const [{ id }, sp] = await Promise.all([params, searchParams]);
  const modo: ModoImpressao = sp.modo === "completa" || sp.modo === "historico" ? sp.modo : "simples";
  const opcoes: [ModoImpressao, string, string][] = [["simples", "OS", ""], ["completa", "OS completa", "?modo=completa"], ["historico", "OS completa com histórico", "?modo=historico"]];
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
