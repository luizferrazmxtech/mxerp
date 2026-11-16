import { prisma } from "@/lib/db";

const brl = (v: unknown) => Number(v ?? 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const qt = (v: unknown) => Number(v ?? 0).toLocaleString("pt-BR", { maximumFractionDigits: 4 });
const cnpjFmt = (c: string) => c.replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/, "$1.$2.$3/$4-$5");

type Linha = { codigo: string; nome: string; unidade: string; quantidade: unknown; custo: unknown; total: unknown };

/** Impressão A4 de ajuste ou transferência de estoque (marca MXTECH). */
export default async function DocumentoEstoque({ titulo, data, por, info, linhas, frete, total, observacoes }: {
  titulo: string; data: Date; por?: string | null; info: [string, string][]; linhas: Linha[]; frete?: unknown; total: unknown; observacoes?: string | null;
}) {
  const empresa = await prisma.empresa.findFirst();
  return (
    <article className="documento mx-auto max-w-[21cm] bg-white p-[1.2cm] text-[13px] text-[#222]">
      <header className="flex items-start gap-4 border-b-2 border-[#018E83] pb-3">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/marca/logo-claro.svg" alt="MXTECH" className="h-12" />
        <div className="flex-1 text-right text-[0.9em] leading-snug">
          <b className="text-[1.1em]">{empresa?.nomeFantasia || empresa?.razaoSocial}</b><br />
          {empresa && <>CNPJ {cnpjFmt(empresa.cnpj)}<br />{[empresa.telefone, empresa.email].filter(Boolean).join(" · ")}</>}
        </div>
      </header>
      <div className="mt-4 flex items-end justify-between">
        <h1 className="text-[1.6em] font-semibold">{titulo}</h1>
        <div className="text-right text-[0.9em]">Data: <b>{data.toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo" })}</b>{por && <><br />Por: <b>{por}</b></>}</div>
      </div>
      <section className="mt-3 grid grid-cols-2 gap-x-4 rounded border border-slate-300 p-3 text-[0.92em]">
        {info.map(([r, v]) => <div key={r}><b>{r}:</b> {v}</div>)}
      </section>
      <table className="mt-4 w-full border-collapse text-[0.92em]">
        <thead><tr className="border-b-2 border-slate-400 text-left"><th className="py-1">#</th><th>Código</th><th>Produto</th><th className="text-right">Qtd.</th><th>Un.</th><th className="text-right">Custo unit.</th><th className="text-right">Total</th></tr></thead>
        <tbody>{linhas.map((l, k) => <tr key={k} className="border-b border-slate-200"><td className="py-1">{k + 1}</td><td>{l.codigo}</td><td>{l.nome}</td><td className="text-right">{qt(l.quantidade)}</td><td>{l.unidade}</td><td className="text-right">{brl(l.custo)}</td><td className="text-right">{brl(l.total)}</td></tr>)}</tbody>
      </table>
      <div className="mt-3 ml-auto w-72 space-y-0.5 text-[0.95em]">
        {frete != null && Number(frete) > 0 && <div className="flex"><span>Frete</span><span className="ml-auto">{brl(frete)}</span></div>}
        <div className="flex border-t border-slate-400 pt-1 text-[1.1em] font-semibold"><span>Valor total</span><span className="ml-auto">{brl(total)}</span></div>
      </div>
      {observacoes && <section className="mt-4"><b className="text-[0.8em] tracking-wide text-[#018E83] uppercase">Observações</b><p className="whitespace-pre-wrap">{observacoes}</p></section>}
      <footer className="mt-10 grid grid-cols-2 gap-10 text-center text-[0.85em]"><div className="border-t border-slate-400 pt-1">Responsável</div><div className="border-t border-slate-400 pt-1">Conferido por</div></footer>
    </article>
  );
}
