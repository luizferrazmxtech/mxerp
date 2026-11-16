import { notFound } from "next/navigation";
import { prisma } from "@/lib/db";
import FormRespostaCotacao from "@/components/compras/FormRespostaCotacao";

export const dynamic = "force-dynamic";
export const metadata = { title: "Cotação de preços" };

const cnpjFmt = (c: string) => c.replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/, "$1.$2.$3/$4-$5");
const dia = (d: Date | null) => (d ? d.toLocaleDateString("pt-BR", { timeZone: "UTC" }) : "");
const v2 = (v: unknown) => (v == null ? "" : Number(v).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 4 }));

/** Link da cotação enviado ao fornecedor: responde os preços sem login (o token é a autorização). */
export default async function LinkCotacao({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const f = await prisma.cotacaoFornecedor.findUnique({ where: { token }, include: { fornecedor: { select: { nome: true } }, respostas: true, cotacao: { include: { itens: { orderBy: { ordem: "asc" } } } } } });
  if (!f) notFound();
  const c = f.cotacao;
  const empresa = await prisma.empresa.findFirst();
  const aberta = c.situacao === "ABERTA";
  return (
    <div className="min-h-screen bg-slate-100 py-6">
      <article className="mx-auto max-w-[21cm] bg-white p-[1cm] text-[13px] text-[#222] shadow-sm">
        <header className="flex items-start gap-4 border-b-2 border-[#018E83] pb-3">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/marca/logo-claro.svg" alt="MXTECH" className="h-12" />
          <div className="flex-1 text-right text-[0.9em] leading-snug">
            <b className="text-[1.1em]">{empresa?.nomeFantasia || empresa?.razaoSocial}</b><br />
            {empresa && <>CNPJ {cnpjFmt(empresa.cnpj)}<br />{[empresa.telefone, empresa.email].filter(Boolean).join(" · ")}</>}
          </div>
        </header>
        <div className="mt-4 flex flex-wrap items-end justify-between gap-2">
          <div><h1 className="text-[1.5em] font-semibold">Cotação de preços nº {c.numero}</h1><p className="text-slate-600">Para <b className="uppercase">{f.fornecedor.nome}</b></p></div>
          <div className="text-right text-[0.9em]">Data: <b>{dia(c.data)}</b>{c.prazo && <><br />Responder até: <b>{dia(c.prazo)}</b></>}</div>
        </div>
        {c.observacoes && <p className="mt-3 rounded border border-slate-200 bg-slate-50 p-3 whitespace-pre-wrap">{c.observacoes}</p>}
        {f.respondidoEm && aberta && <p className="mt-3 text-[12px] text-emerald-700">Você respondeu em {f.respondidoEm.toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo", dateStyle: "short", timeStyle: "short" })}. Pode corrigir e enviar de novo enquanto a cotação estiver aberta.</p>}
        <div className="mt-4">
          <FormRespostaCotacao token={token} aberta={aberta}
            itens={c.itens.map((i) => ({ id: i.id, nome: i.nome, detalhes: i.detalhes, quantidade: Number(i.quantidade), unidade: i.unidade, valor: v2(f.respostas.find((r) => r.itemId === i.id)?.valorUnit) }))}
            inicial={{ frete: v2(f.frete), prazoEntrega: f.prazoEntrega ?? "", condicao: f.condicao ?? "", observacao: f.observacao ?? "" }} />
        </div>
      </article>
    </div>
  );
}
