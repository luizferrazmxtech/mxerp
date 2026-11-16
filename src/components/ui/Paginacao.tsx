import Link from "next/link";
import Icone from "@/components/Icone";
import { urlCom } from "./BarraLista";

export const POR_PAGINA = [20, 50, 100];

/** Lê ?p (página) e ?pp (por página) da URL. */
export function lerPagina(params: { p?: string; pp?: string }) {
  const porPagina = POR_PAGINA.includes(Number(params.pp)) ? Number(params.pp) : 20;
  const pagina = Math.max(1, Math.floor(Number(params.p) || 1));
  return { pagina, porPagina, skip: (pagina - 1) * porPagina, take: porPagina };
}

/** Rodapé das listagens de cadastro: "Registros | N no total", páginas numeradas e "Por página". */
export default function Paginacao({ base, params, total, pagina, porPagina }: {
  base: string; params: Record<string, string | undefined>; total: number; pagina: number; porPagina: number;
}) {
  const paginas = Math.max(1, Math.ceil(total / porPagina));
  const ini = Math.max(1, Math.min(pagina - 2, paginas - 4));
  const nums = Array.from({ length: Math.min(5, paginas) }, (_, i) => ini + i);
  const url = (p: number) => urlCom(base, params, { p: p > 1 ? String(p) : undefined });
  return (
    <div className="flex flex-wrap items-center gap-3 border-t border-slate-200 px-3 py-2.5 text-[12px] text-slate-600">
      <span className="rounded border border-slate-200 bg-white px-2 py-1">Registros <span className="mx-1 text-slate-300">|</span> <b>{total}</b> no total</span>
      {paginas > 1 && (
        <nav className="flex items-center gap-1" aria-label="Páginas">
          {pagina > 1 && <Link href={url(pagina - 1)} className="btn-icone" title="Página anterior"><Icone nome="direita" size={13} className="rotate-180" /></Link>}
          {nums.map((n) => (
            <Link key={n} href={url(n)} className={`inline-flex h-[28px] min-w-[28px] items-center justify-center rounded border px-1.5 ${n === pagina ? "border-tinta bg-tinta text-white" : "border-slate-200 bg-white hover:bg-slate-100"}`}>{n}</Link>
          ))}
          {pagina < paginas && <Link href={url(pagina + 1)} className="btn-icone" title="Go to next page"><Icone nome="direita" size={13} /></Link>}
        </nav>
      )}
      <span className="ml-auto flex items-center gap-1">Por página:
        {POR_PAGINA.map((n) => (
          <Link key={n} href={urlCom(base, params, { pp: n === 20 ? undefined : String(n), p: undefined })}
            className={`rounded px-1.5 py-0.5 ${n === porPagina ? "bg-slate-200 font-semibold text-slate-800" : "hover:bg-slate-100"}`}>{n}</Link>
        ))}
      </span>
    </div>
  );
}

/** Cabeçalho de coluna ordenável (?o=campo ou ?o=-campo). */
export function Ordenar({ base, params, campo, children, className = "" }: {
  base: string; params: Record<string, string | undefined>; campo: string; children: React.ReactNode; className?: string;
}) {
  const atual = params.o ?? "";
  const asc = atual === campo, desc = atual === "-" + campo;
  return (
    <th className={className}>
      <Link href={urlCom(base, params, { o: asc ? "-" + campo : campo, p: undefined })} className="inline-flex items-center gap-1 hover:underline">
        {children}{asc ? " ▲" : desc ? " ▼" : ""}
      </Link>
    </th>
  );
}
